/// <reference path="../../Scripts/MadCapGlobal.js" />
/// <reference path="../../Scripts/MadCapUtilities.js" />
/// <reference path="../../Scripts/MadCapDom.js" />
/// <reference path="../../Scripts/MadCapXhr.js" />
/// <reference path="MadCapHelpSystem.js" />

/*!
 * Copyright MadCap Software
 * http://www.madcapsoftware.com/
 * Unlicensed use is strictly prohibited
 *
 * v13.0.6142.28919
 */


(function () {
    if (!MadCap.Utilities.HasRuntimeFileType("Default"))
        return;

    MadCap.WebHelp = MadCap.CreateNamespace("WebHelp");

    var previewMode = window.external && window.external.attached && window.external.attached(); // Previewing style changes in the skin editor

    MadCap.WebHelp.TocPane = function (runtimeFileType, helpSystem, rootUl, canSync) {
        var mSelf = this;
        this._Init = false;
        this._RuntimeFileType = runtimeFileType;
        this._RootUl = rootUl;
        this._CanSync = canSync;
        this._HelpSystem = helpSystem;
        this._TocFile = this._RuntimeFileType == "Toc" ? this._HelpSystem.GetTocFile() : this._HelpSystem.GetBrowseSequenceFile();
        this._LoadedNodes = [];
        var gTocPath = null;
        var gTocHref = null;

        MadCap.Utilities.CrossFrame.AddMessageHandler(this.OnMessage, this);

        this._Initializing = false;
        this._InitOnCompleteFuncs = new Array();

        this.TreeNode_Expand = function (e) {
            var target = e.target;

            var liEl = $(target).closest("li")[0];

            if (liEl == null)
                return;

            var $liEl = $(liEl);
            var isTreeNodeLeaf = $liEl.hasClass(mSelf._TreeNodeLeafClass);

            if (!isTreeNodeLeaf)
                $liEl.toggleClass(mSelf._TreeNodeExpandedClass).toggleClass(mSelf._TreeNodeCollapsedClass);

            var $imgEl = $liEl.find("> div img");
            var alt2 = $imgEl.attr("data-mc-alt2");
            var alt = $imgEl.attr("alt");

            if (alt2 != "") {
                $imgEl.attr("alt", alt2);
                $imgEl.attr("data-mc-alt2", alt);
            }

            if (mSelf._IncludeIndicator) { // if tripane
                var $aEl = $liEl.find("> div a");
                if ($aEl[0] != null) {
                    var href = $aEl.attr("href");

                    if (!MadCap.String.IsNullOrEmpty(href))
                        mSelf._SelectNode(liEl);

                    // if the click didn't occur on the <a> itself, handle it ourselves
                    if ($aEl[0] != target) {
                        var frameName = $aEl.attr("target");

                        if (!MadCap.String.IsNullOrEmpty(href)) {
                            if (frameName != null)
                                window.open(href, frameName);
                            else
                                document.location.href = href;
                        }
                    }
                }
            }

            var node = mSelf._LoadedNodes[$liEl.attr('data-mc-id')];

            if (typeof node.n == 'undefined' || node.n.length == 0) { // leaf
                node.childrenLoaded = true;
            }

            if (!node.childrenLoaded) {
                var $a = $('a', $liEl).first();
                var $ul = $('<ul/>');
                var $subMenuClass = $(mSelf._RootUl).attr("data-mc-css-sub-menu") || "tree inner";
                $ul.addClass($subMenuClass);
                if (previewMode) {
                    $ul.attr('data-mc-style', "Navigation Panel Item");
                }

                mSelf.LoadTocChildren(node, $ul, function () {
                    $liEl.append($ul);

                    if (mSelf._DeferExpandEvent) {
                        setTimeout(function () {
                            $a.trigger(mSelf._ExpandEvent);
                        }, 100);
                    }
                });

                if (mSelf._DeferExpandEvent) {
                    e.stopImmediatePropagation();
                    return false;
                }
            }

            // forces the content body to slide over thereby "navigating" to the selected topic
            // caveat: only works for tree node leafs
            if (isTreeNodeLeaf) {
                $('body').removeClass('active');

                // maintain selected skin
                MadCap.Utilities.Url.OnNavigateTopic.call(target, e);
            }
        };
    };

    var TocPane = MadCap.WebHelp.TocPane;

    TocPane.prototype.OnMessage = function (message, dataValues, responseData) {
        var returnData = { Handled: false, FireResponse: true };

        if (message == "sync-toc") {
            var tocType = dataValues[0];
            var tocPath = dataValues[1];
            var href = new MadCap.Utilities.Url(dataValues[2]);

            if (this._CanSync && (tocType == null || tocType == this._RuntimeFileType)) {
                this.SyncTOC(tocPath, href);
                returnData.Handled = true;
            }
        }

        return returnData;
    };

    TocPane.prototype.Init = function (OnCompleteFunc) {
        if (this._Init) {
            if (OnCompleteFunc != null)
                OnCompleteFunc();

            return;
        }

        if (OnCompleteFunc != null)
            this._InitOnCompleteFuncs.push(OnCompleteFunc);

        if (this._Initializing)
            return;

        this._Initializing = true;

        //

        var $rootUl = $(this._RootUl);

        this._SubMenuClass = $rootUl.attr("data-mc-css-sub-menu") || "tree inner";
        this._TreeNodeClass = $rootUl.attr("data-mc-css-tree-node") || "tree-node";
        this._TreeNodeCollapsedClass = $rootUl.attr("data-mc-css-tree-node-collapsed") || "tree-node-collapsed";
        this._TreeNodeExpandedClass = $rootUl.attr("data-mc-css-tree-node-expanded") || "tree-node-expanded";
        this._TreeNodeLeafClass = $rootUl.attr("data-mc-css-tree-node-leaf") || "tree-node-leaf";
        this._TreeNodeSelectedClass = $rootUl.attr("data-mc-css-tree-node-leaf") || "tree-node-selected";

        this._IncludeBack = MadCap.Dom.GetAttributeBool(this._RootUl, "data-mc-include-back", false);
        this._IncludeParentLink = MadCap.Dom.GetAttributeBool(this._RootUl, "data-mc-include-parent-link", false);
        this._IncludeIcon = MadCap.Dom.GetAttributeBool(this._RootUl, "data-mc-include-icon", true);
        this._IncludeIndicator = MadCap.Dom.GetAttributeBool(this._RootUl, "data-mc-include-indicator", true);
        this._DeferExpandEvent = MadCap.Dom.GetAttributeBool(this._RootUl, "data-mc-defer-expand-event", false);

        this._ExpandEvent = $rootUl.attr("data-mc-expand-event") || "click";
        this._BackLink = $rootUl.attr("data-mc-back-link") || "Back";

        var mSelf = this;

        $rootUl.attr("data-mc-chunk", "Data/" + this._RuntimeFileType + ".xml");

        this.CreateToc(this._RootUl, function () {
            mSelf._Init = true;

            for (var i = 0; i < mSelf._InitOnCompleteFuncs.length; i++) {
                mSelf._InitOnCompleteFuncs[i]();
            }
        });
    };

    TocPane.prototype.CreateToc = function (rootUl, OnCompleteFunc) {
        var hasToc = true;

        if (this._RuntimeFileType == "Toc")
            hasToc = this._HelpSystem.HasToc;
        else
            hasToc = this._HelpSystem.HasBrowseSequences;

        if (!hasToc) {
            if (OnCompleteFunc != null)
                OnCompleteFunc();

            return;
        }

        var self = this;

        self._HelpSystem.LoadToc(this._RuntimeFileType, function (toc, args) {
            var $ul = $(rootUl);
            if (previewMode) {
                $ul.attr('data-mc-style', "Navigation Panel Item");
            }

            self.LoadTocChildren(toc.tree, $ul, function () {
                this._Init = true;

                if (OnCompleteFunc != null)
                    OnCompleteFunc();
            });
        }, null);
    };

    TocPane.prototype.LoadTocChildren = function (node, el, OnCompleteFunc) {
        var length = typeof node.n !== 'undefined' ? node.n.length : 0; // n property holds child nodes
        var loaded = 0;

        if (length == 0) {
            node.childrenLoaded = true;
        }

        if (node.childrenLoaded) {
            if (OnCompleteFunc)
                OnCompleteFunc();

            return;
        }

        if (node.parent) {
            if (this._IncludeBack) {
                var $li = $('<li class="back"/>');
                $li.addClass(this._TreeNodeClass);

                var $a = $('<a href="#" />');
                $a.text(this._BackLink);

                $li.append($a);

                el.append($li);
            }

            if (this._IncludeParentLink && this._HelpSystem.GetTocEntryHref(node) != null) {
                var $li = $('<li/>');
                $li.addClass(this._TreeNodeClass);
                $li.addClass(this._TreeNodeLeafClass);

                el.append($li);

                this.LoadTocNode(node, $li, null);
            }
        }

        // Create elements
        for (var i = 0; i < length; i++) {
            var childNode = node.n[i];

            var $li = $('<li/>');
            $li.addClass(this._TreeNodeClass);
            $li.addClass(this._TreeNodeCollapsedClass);

            el.append($li);

            this.LoadTocNode(childNode, $li, function () {
                loaded++;

                if (loaded == length) {
                    node.childrenLoaded = true;

                    if (OnCompleteFunc != null)
                        OnCompleteFunc();
                }
            });
        }
    }

    TocPane.prototype.LoadTocNode = function (node, el, OnCompleteFunc) {
        var self = this;
        var toc = node.toc;

        this._HelpSystem.LoadTocChunk(toc, node.c, function (chunk) {
            var entry = toc.entries[node.i];
            var hasFrame = typeof node.f != 'undefined';
            var isLeaf = typeof node.n == 'undefined' || node.n.length == 0;
            var tocType = self._CanSync && !hasFrame ? self._RuntimeFileType : null;
            var href = self._HelpSystem.GetTocEntryHref(node, tocType, self._CanSync, true);

            var $a = $('<a/>');

            if (hasFrame) {
                $a.attr('target', node.f);
            }
            if (href != null) {
                $a.attr('href', href);
            }
            else {
                $a.attr('href', 'javascript:void(0);');
            }
            $a.text(entry.title);

            if (typeof node.s != 'undefined') { // class
                el.addClass(node.s);
            }

            if (isLeaf) {
                el.removeClass(self._TreeNodeCollapsedClass);
                el.addClass(self._TreeNodeLeafClass);
            }            

            if (self._IncludeIcon) {
                // create transparent image
                var customClass = "default";
                var language = self._HelpSystem.Language;

                // check li for custom class
                for (className in language) {
                    if (el.hasClass(className)) {
                        customClass = className;
                        break;
                    }
                }

                var $img = $('<img/>');
                $img.attr('src', 'Skins/Default/Stylesheets/Images/transparent.gif');
                $img.addClass('toc-icon');
                if (self._IncludeIndicator && typeof node.w !== 'undefined' && node.w == 1) {
                    $img.attr('alt', language[customClass]['MarkAsNewIconAlternateText']);
                }
                else if (el.hasClass(self._TreeNodeLeafClass)) {
                    $img.attr('alt', language[customClass]['TopicIconAlternateText']);
                }
                else {
                    $img.attr('alt', language[customClass]['ClosedBookIconAlternateText']);
                    $img.attr('data-mc-alt2', language[customClass]['OpenBookIconAlternateText']);
                }
                if ($img.prop('src') != "") {
                    $a.prepend($img);
                }
            }

            if (self._IncludeIndicator) {
                var $div = $('<div/>');

                if (typeof node.w !== 'undefined' && node.w == 1) // mark as new
                    $div.append("<span class='new-indicator'></span>");

                var $span = $('<span class="label" />');

                $span.append($a);

                $div.append($span);

                $a = $div;
            }

            $a.on(self._ExpandEvent, self.TreeNode_Expand);

            node.el = el; // TODO: make el a collection for multiple elements referencing the same node (e.g. IncludeParentLink, multiple tocs on a page)

            el.append($a);
            el.attr('data-mc-id', self._LoadedNodes.length);

            self._LoadedNodes.push(node);

            if (OnCompleteFunc != null)
                OnCompleteFunc();
        });
    };

    TocPane.prototype.SyncTOC = function (tocPath, href) {
        var self = this;

        var selected = $("." + this._TreeNodeSelectedClass + " a", this._RootUl);

        if (selected.length > 0) {
            var link = selected[0];
            if (link.href === document.location.href)
                return;
        }

        this.Init(function () {
            function OnFoundNode(node) {
                if (typeof node !== 'undefined' && node != null) {
                    var loadNodes = [];
                    var loadNode = node;

                    while (typeof loadNode !== 'undefined' && !loadNode.childrenLoaded) {
                        loadNodes.unshift(loadNode);
                        loadNode = loadNode.parent;
                    }

                    MadCap.Utilities.AsyncForeach(loadNodes,
                            function (loadNode, callback) {
                                var $el = $(loadNode.el);

                                var $ul = $('<ul/>');
                                $ul.addClass(self._SubMenuClass);

                                self.LoadTocChildren(loadNode, $ul, function () {
                                    $el.append($ul);
                                    callback();
                                });
                            },
                            function () {
                                var el = node.el[0];
                                self._UnhideNode(el);
                                self._SelectNode(el);
                            }
                        );
                }
            }

            function FindNode(href) {
                self._HelpSystem.FindNode(self._RuntimeFileType, tocPath, href, function (node) {
                    if (!node) { // if we don't find a node, try looking for plain path
                        if (!MadCap.String.IsNullOrEmpty(href.Fragment) || !MadCap.String.IsNullOrEmpty(href.Query)) {
                            var url = new MadCap.Utilities.Url(href.PlainPath);
                            self._HelpSystem.FindNode(self._RuntimeFileType, tocPath, url, OnFoundNode);
                        }
                    }
                    else {
                        OnFoundNode(node);
                    }
                });
            }

            var cshid = href.HashMap.GetItem('cshid');

            if (cshid != null) {
                self._HelpSystem.LookupCSHID(cshid, function (idInfo) {
                    var url = idInfo.Found ? new MadCap.Utilities.Url(idInfo.Topic).ToRelative(self._HelpSystem.GetContentPath()) 
                                           : new MadCap.Utilities.Url(self._HelpSystem.DefaultStartTopic);
                    FindNode(url);
                });
            }
            else {
                FindNode(href);
            }
        });
    };

    TocPane.prototype._UnhideNode = function (tocNode) {
        var parentTocNode = MadCap.Dom.GetAncestorNodeByTagName(tocNode, "li", this._RootUl);

        while (parentTocNode != null) {
            var $parentTocNode = $(parentTocNode);
            $parentTocNode.removeClass(this._TreeNodeCollapsedClass);
            $parentTocNode.addClass(this._TreeNodeExpandedClass);

            parentTocNode = MadCap.Dom.GetAncestorNodeByTagName(parentTocNode, "li", this._RootUl);
        }
    };

    TocPane.prototype.NavigateTopic = function (moveType) {
        var selectedNode = $("." + this._TreeNodeSelectedClass, this._RootUl)[0];

        if (selectedNode == null)
            selectedNode = $("." + this._TreeNodeClass, this._RootUl)[0];

        //

        if (this.NeedsCreateToc(selectedNode)) {
            var mSelf = this;

            this.CreateToc(selectedNode, function () {
                mSelf.NavigateTopic(moveType);
            });

            return;
        }

        //

        var nextNode = moveType == "previous" ? this._GetPrevious(selectedNode) : this._GetNext(selectedNode);

        if (nextNode == null)
            return;

        this._SelectNode(nextNode);

        var a = $("> div a", nextNode)[0];

        if (a != null)
            document.location.href = $(a).attr("href");

        this._UnhideNode(nextNode);
    };

    TocPane.prototype._SelectNode = function (node) {
        var $node = $(node);

        $("." + this._TreeNodeSelectedClass, this._RootUl).removeClass(this._TreeNodeSelectedClass);
        $node.addClass(this._TreeNodeSelectedClass);
        $node.scrollintoview();
    };

    TocPane.prototype._GetNext = function (node) {
        var $node = $(node);
        var treeNodeSelector = "." + this._TreeNodeClass;

        if ($node.find(treeNodeSelector).length > 0)
            return $node.find(treeNodeSelector)[0];

        if ($node.next(treeNodeSelector).length > 0)
            return $node.next(treeNodeSelector)[0];

        var $currAnc = $node;

        while (true) {
            var $anc = $($currAnc.parent().closest(treeNodeSelector, this._RootUl));

            if ($anc.length == 0)
                break;

            if ($anc.next(treeNodeSelector).length > 0)
                return $anc.next(treeNodeSelector)[0];

            $currAnc = $anc;
        }

        return null;
    };

    TocPane.prototype._GetPrevious = function (node) {
        var $node = $(node);
        var treeNodeSelector = "." + this._TreeNodeClass;

        var $prev = $node.prev(treeNodeSelector);

        if ($prev.length == 0) {
            if ($node.parent().closest(treeNodeSelector, this._RootUl).length > 0)
                return $node.parent().closest(treeNodeSelector, this._RootUl)[0];
            else
                return null;
        }

        if ($prev.find(treeNodeSelector).length > 0)
            return $prev.find(treeNodeSelector).last()[0];

        return $prev[0];
    };
})();
