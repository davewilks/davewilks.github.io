/// <reference path="../../Scripts/jquery.js" />
/// <reference path="../../Scripts/MadCapGlobal.js" />
/// <reference path="../../Scripts/MadCapUtilities.js" />
/// <reference path="../../Scripts/MadCapDom.js" />
/// <reference path="../../Scripts/MadCapFeedback.js" />
/// <reference path="MadCapToc.js" />
/// <reference path="MadCapIndex.js" />
/// <reference path="MadCapHelpSystem.js" />
/// <reference path="MadCapSearch.js" />

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

    var isTriPane = MadCap.Utilities.HasRuntimeFileType("TriPane");
    var isDefault = isTriPane || MadCap.Utilities.IsRuntimeFileType("Default");
    var isSkinPreview = MadCap.Utilities.HasRuntimeFileType("SkinPreview");

    var $lastActiveTab = null;
    var _searchPrefix = "search-";    
    var timer = null;

    function Window_Onload(e) {
        MadCap.DEBUG.Log.AddLine(window.name + "onload");
        MadCap.DEBUG.Log.AddLine(window.name + "hash: " + document.location.hash);
        MadCap.DEBUG.Log.AddLine(window.name + "search: " + document.location.search);

        // IE9 bug - left/right border radii are reversed in RTL elements
        if ($.browser.msie && $.browser.version <= 9.0) {
            var $searchField = $("#search-field");
            if ($searchField.css("direction") == "rtl") {
                $searchField.css({
                    "border-top-left-radius": $searchField.css("border-top-right-radius"),
                    "border-top-right-radius": $searchField.css("border-top-left-radius"),
                    "border-bottom-left-radius": $searchField.css("border-bottom-right-radius"),
                    "border-bottom-right-radius": $searchField.css("border-bottom-left-radius")
                });
            }

            var $contentBody = $("#contentBody");
            if ($contentBody.css("direction") == "rtl") {
                $contentBody.css({
                    "border-top-left-radius": $contentBody.css("border-top-right-radius"),
                    "border-top-right-radius": $contentBody.css("border-top-left-radius")
                });
            }
        }

        // Apply placeholder polyfill
        $("input, textarea").placeholder();

        // Set up navigation tabs click handlers
        $(".tabs .tabs-nav li").click(NavTabs_Click);

        $("ul.navigation ul li").mouseenter(TopNavigationMenuItem_MouseEnter);

        // Set up home button
        $("#home").click(GoHome);

        // hookup navigation links
        $('nav.tab-bar a, a.homeLink, a.GenConceptText, a.GlossaryPageLink').click(MadCap.Utilities.Url.OnNavigateTopic);

        // Set up search
        $(".search-submit").click(function (e) {
            SearchFormSubmit(e);
        });
        $("#search-field, #search-field-sidebar, .search-field").keypress(function (e) {
            if (e.which != 13)
                return;

            SearchFormSubmit(e);

            e.preventDefault();
        });
        $(".search-filter").click(function (e) {
            var $self = $(this);
            var $filterContent = $(".search-filter-content", this);

            if ($self.hasClass("open"))
                CloseSearchFilter(0, 0, $filterContent, $self);
            else {
                $(this).addClass("open");

                if (window.PIE) {
                    // When a filter is selected it causes the search bar width to change. PIE wasn't automatically detecting this and re-rendering as it should have been.
                    // So instead, manually detach and re-attach to workaround this.
                    $(".search-submit-wrapper").each(function () {
                        PIE.detach(this);
                        PIE.attach(this);
                    });
                }

                $filterContent.fadeIn(200);
                $filterContent.css("max-height", $(window).height() - $filterContent.offset().top);
            }
        });

        if (!$.browser.mobile) {
            $(".search-filter").mouseenter(function (e) {
                clearTimeout(timer);
            });
            $(".search-filter").mouseleave(function (e) {
                var $searchFilter = $(this);
                var $searchFilterContent = $(".search-filter-content", this);

                CloseSearchFilter(200, 500, $searchFilterContent, $searchFilter);
            });
        }

        // Set up the resize bar
        $("#navigationResizeBar").mousedown(NavigationResizeBar_MouseDown);
        $("#show-hide-navigation").click(ShowHideNavigation_Click);
        AdjustTabs(parseInt($("#navigation").css("width")));

        // Store the page title. Each topic title will be appended to it when they're loaded.
        var $title = $("title");
        $title.attr("data-title", document.title);

        if (isTriPane) {
            // Set up buttons
            $(".print-button").click(function (e) {
                if (!isSkinPreview)
                    MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "print");
            });

            $(".expand-all-button").click(function (e) {
                var $this = $(this);

                if ($this.hasClass("expand-all-button"))
                    MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "expand-all");
                else if ($this.hasClass("collapse-all-button"))
                    MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "collapse-all");

                MadCap.Utilities.ToggleButtonState(this);
            });
            $(".remove-highlight-button").click(function (e) {
                MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "remove-highlight");
            });

            $("#topic").load(function () {
                // Add the topic title to the page title
                MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "get-title", null, function (data) {
                    var defaultTitle = $title.attr("data-title");
                    var newTitle = defaultTitle;

                    if (!MadCap.String.IsNullOrEmpty(defaultTitle))
                        newTitle += " - ";

                    document.title = newTitle + data[0];
                });
                
                _TopicID = null;
                UpdateRating();
                UpdateCommentsInTopic();
            });
        }

        $(".previous-topic-button").click(function (e) {
            PreviousTopic();
        });

        $(".next-topic-button").click(function (e) {
            NextTopic();
        });

        $(".side-menu-button").click(function (e) {
            e.preventDefault();
            $('.off-canvas').toggleClass('active');
        });

        $lastActiveTab = $(document).find(".tab")[0];

        // Load the help system
        var pathToHelpSystem = $(document.documentElement).attr('data-mc-path-to-help-system');
        var helpSystemPath = "Data/HelpSystem.xml";

        if (pathToHelpSystem)
            helpSystemPath = pathToHelpSystem + helpSystemPath;

        if (MadCap.WebHelp && MadCap.WebHelp.HelpSystem) {
            MadCap.WebHelp.HelpSystem.LoadHelpSystem(helpSystemPath).done(function (helpSystem) {
                _HelpSystem = helpSystem;
                _SearchPane = new MadCap.WebHelp.SearchPane(_HelpSystem, $("#searchPane"));

                if (_HelpSystem.LiveHelpEnabled)
                    _FeedbackController = MadCap.WebHelp.LoadFeedbackController(_HelpSystem.LiveHelpServer);
                else if (isSkinPreview)
                    _FeedbackController = new MadCap.WebHelp.MockFeedbackController();

                if (_FeedbackController != null) {
                    _FeedbackController.Init(function () {
                        if (_FeedbackController.PulseActive) {
                            $(document.documentElement).addClass('pulse-active');

                            // extra call to adjust tabs for community tab
                            AdjustTabs(parseInt($("#navigation").css("width")));
                        }

                        if (_FeedbackController.FeedbackActive) {
                            $(document.documentElement).addClass('feedback-active');

                            InitCommunityFeatures();

                            var currentUrl = MadCap.Utilities.Url.GetDocumentUrl();

                            if (!isTriPane) {
                                UpdateRating();
                                if (!MadCap.Utilities.HasRuntimeFileType("Search"))
                                    UpdateCommentsInTopic();
                            }
                        }
                    });
                }

                if (isTriPane && _HelpSystem.DefaultSkin != null && !MadCap.String.IsNullOrEmpty(_HelpSystem.DefaultSkin.Tabs))
                    LoadDefaultPane();

                LoadMenus();

                var currentUrl = MadCap.Utilities.Url.GetDocumentUrl();

                // Load initial settings from hash
                if (document.location.hash.length > 1)
                    LoadFromHash();
                else
                    LoadFile(_HelpSystem.DefaultStartTopic + currentUrl.Query);

                if (currentUrl.QueryMap.GetItem("cshid") != null) {
                    LoadCshFromUrl();
                }

                LoadSkinFromQuery();

                // Set the size of the browser if enabled in the skin
                if (isTriPane)
                    SetSize(_HelpSystem.DefaultSkin);

                ReinitSkinsButton();

                ReinitSelectLanguageButton();

                // default to web layout for non-responsive outputs
                if (!_HelpSystem.IsResponsive) {
                    $("body").addClass("web");
                }
                else if (_HelpSystem.IsTabletLayout()) {
                    // default to collapsed tabs on load in responsive layouts
                    GoHome();
                }

                // Load search filters
                _HelpSystem.LoadSearchFilters().then(function (filters) {
                    var filterMap = filters ? filters.map : null;
                    var filterNames = [];
                    var hasCustomOrder = false;

                    if (filterMap) {
                        for (var filterName in filterMap) {
                            var filter = filterMap[filterName];
                            if (!MadCap.String.IsNullOrEmpty(filter.c)) { // ignore filters with no concepts
                                filterNames.push(filterName);
                                hasCustomOrder |= filter.o != -1;
                            }
                        }
                    }

                    if (filterNames.length == 0) {
                        if (window.PIE) {
                            $(".search-submit-wrapper").each(function () {
                                PIE.attach(this);
                            });
                        }

                        $("#SearchTab").closest('div').empty();
                        return;
                    }

                    $(".search-filter-wrapper").show();

                    if (window.PIE) {
                        $(".search-filter, .search-submit-wrapper").each(function () {
                            PIE.attach(this);
                        });
                    }

                    var orderToNameMap = {};
            
                    filterNames.forEach(function (key) {
                        var filter = filterMap[key];
                        if (filter.o > -1)
                            orderToNameMap[filter.o] = key;
                    });

                    if (hasCustomOrder) {
                        var sortedList = filterNames.sort(function (name1, name2) {
                            // sort priority 1: group
                            if (filterMap[name1].group != filterMap[name2].group) {
                                return filterMap[name1].group - filterMap[name2].group;
                            }
                            // sort priority 2: order within the group
                            if (filterMap[name1].o != filterMap[name2].o) {
                                return filterMap[name1].o - filterMap[name2].o;
                            }
                            // sort priority 3: ABC
                            return (name1 < name2 ? -1 : name1 > name2 ? 1 : 0);
                        });
                        filterNames = sortedList;
                    }
                    // else simple ABC sort
                    else {
                        var sortedList = filterNames.sort();
                        filterNames = sortedList;
                    }
                    
                    if (isTriPane && $(".search-bar").css('display') == 'none') {
                        $("#SearchTab").closest(".tab").remove();
                        return;
                    }

                    var $ul = $("#search ul");
                    for (var i = 0, length = filterNames.length; i < length; i++) {
                        $(".search-filter-content ul").append($("<li></li>").text(filterNames[i]));

                        var $li = $('<li/>');
                        $li.addClass('SearchFilterEntry tree-node tree-node-leaf');

                        var $item = $('<div class="SearchFilter" />');
                        var $span = $('<span class="label" />')
                        $span.text(filterNames[i]);

                        $item.append($span);

                        $li.append($item);
                        $ul.append($li);
                    }

                    HookupSearchFilters();
                });

                OnLayout(e);
            });
        }
        else {
            HookupSearchFilters();
        }
    }

    function HookupSearchFilters() {
        // standard search bar
        $(".search-filter-content li").click(function (e) {
            var $searchFilterLi = $(e.target);
            var filterName = $searchFilterLi.text().trim();
            var $searchField = $searchFilterLi.closest(".search-bar").children(".search-field");
            var searchQuery = $searchField.val();
            var $searchFilter = $searchFilterLi.closest(".search-filter");
            var $searchFilterContent = $searchFilterLi.closest(".search-filter-content");

            SetSelectedSearchFilter(filterName);
            UpdateSearchFilterState(filterName, $searchFilter);

            CloseSearchFilter(0, 0, $searchFilterContent, $searchFilter);

            RedoSearch(searchQuery, filterName);
        });

        // responsive side bar
        $(".SearchFilter").click(function (e) {
            var $target = $(e.target).closest('.SearchFilterEntry');
            var searchQuery = $('#search-field-sidebar').val();

            $('.SearchFilterEntry.tree-node-selected').removeClass('tree-node-selected');

            if ($target.hasClass('SearchFilterEntry')) {
                $target.addClass('tree-node-selected');

                var filterName = $target.find('.SearchFilter').text().trim();

                var $searchField = $('#search-field-sidebar');
                if (!$searchField.attr('data-placeholder'))
                    $searchField.attr('data-placeholder', $searchField.attr('placeholder'));
                $searchField.attr('placeholder', $searchField.attr('data-placeholder') + ' ' + filterName);

                SetSelectedSearchFilter(filterName, this);

                RedoSearch(searchQuery, filterName);
            }
        });
    }

    function GetTopicID(onComplete) {
        if (isTriPane) {
            // Request the topic ID from the topic iframe
            MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "get-topic-id", null, function (data) {
                onComplete(data[0]);
            });
        }
        else {
            onComplete($('html').attr("data-mc-live-help"));
        }
    }

    function CloseSearchFilter(fadeoutTime, displayTime, searchFilterContent, searchFilter) {
        if (timer)
            clearTimeout(timer);

        timer = setTimeout(function () {
            $(searchFilterContent).fadeOut(fadeoutTime, function () {
                $(searchFilter).removeClass("open");
            });
        }, displayTime);
    }

    function SetSelectedSearchQuery(query) {
        $(".search-field").val(query);
        $("#search-field-sidebar").val(query);
    }

    function SetSelectedSearchFilter(filterName) {
        $('.search-filter').data('filter', filterName);

        if (!isTriPane) {
            var $searchField = $('.search-field');
            if (!$searchField.attr('data-placeholder'))
                $searchField.attr('data-placeholder', $searchField.attr('placeholder'));
            $searchField.attr('placeholder', $searchField.attr('data-placeholder') + ' ' + filterName);
        }
        else
            $('.search-filter > span').text(filterName);
    }

    function UpdateSearchFilterState(filterName, context) {
        // also set the state to selected
        var $searchFilterContent = $('.search-filter-content', context);
        var searchFilterContentUl = $searchFilterContent.children()[0];
        var allFilesSelection = $(searchFilterContentUl).children()[0];

        filterName !== $(allFilesSelection).text() ? $('.search-filter').addClass('selected') : $('.search-filter').removeClass('selected');
    }

    function ReinitSkinsButton() {
        var $selectSkin = $(".select-skin-button");
        if (isSkinPreview || (_HelpSystem.IsResponsive && _HelpSystem.DefaultSkin != null && _HelpSystem.GetSkins().length > 1)) {
            $selectSkin.click(function (e) {
                var skins = [];

                var url = new MadCap.Utilities.Url(document.location.href);
                $.each(_HelpSystem.GetSkins(), function (i, skin) {
                    var link = { Title: skin.Name, Link: url.PlainPath + '?skinName=' + skin.SkinID + url.Fragment };
                    skins[skins.length] = link;
                });
                MadCap.TextEffects.CreateToolbarDropdown(skins, $selectSkin[0], 'select-skin-drop-down');

                e.preventDefault();
                e.stopPropagation();
            });
        }
        else {
            $selectSkin.hide();
        }
    }

    function ReinitSelectLanguageButton() {
        var $selectLanguage = $(".select-language-button");

        if (isSkinPreview) {
            $selectLanguage.click(function (e) {
                MadCap.TextEffects.CreateDummyToolbarDropdown($selectLanguage, "select-language-drop-down", "Language");
                e.preventDefault();
                e.stopPropagation();
            });
            return;
        }

        if (!_HelpSystem.IsMultilingual) {
            $selectLanguage.hide();
            return;
        }

        require([_HelpSystem.GetPath() + "../languages.js"], function (languagefile) {
            var languages = languagefile.data;
            if (languages.length > 1) {
                //var $img = $("img", $selectLanguage);
                //for (var i = 0; i < languages.length; i++) {
                //    if (languages[i].code == _HelpSystem.LanguageCode) {
                //        $img.attr("src", _HelpSystem.GetPath() + "../Resources/Images/Country/" + languages[i].flag);
                //        $img.attr("alt", languages[i].full);
                //        break;
                //    }
                //}
                $selectLanguage.click(function (e) {
                    var languageLinks = [];
                    var pathToRoot = _HelpSystem.GetPath();
                    var pathToCurrentTopicFromRoot = _HelpSystem.GetCurrentTopicPath();
                    var url = new MadCap.Utilities.Url(document.location.href);

                    for (var i = 0; i < languages.length; i++) {
                        var pathToNewLanguageRoot = '../' + languages[i].code + '/';
                        var linkPath = pathToRoot + pathToNewLanguageRoot + pathToCurrentTopicFromRoot;
                        //var imagePath = pathToRoot + '../Resources/Images/Country/' + languages[i].flag;
                        //var link = { Title: languages[i].full, Link: linkPath, Image: imagePath };
                        var link = { Title: languages[i].full, Link: linkPath };
                        languageLinks[languageLinks.length] = link;
                    }

                    MadCap.TextEffects.CreateToolbarDropdown(languageLinks, $selectLanguage[0], 'select-language-drop-down');

                    e.preventDefault();
                    e.stopPropagation();
                });
            } else {
                $selectLanguage.hide();
            }
        });
    }

    var lastWindowWidth = window.innerWidth;
    var OnLayout = MadCap.Utilities.Debounce(function () {
        var windowWidth = window.innerWidth;

        if (_HelpSystem && _HelpSystem.IsResponsive) {
            var isTabletLayout = _HelpSystem.IsTabletLayout();
            var wasTabletLayout = _HelpSystem.IsTabletLayout(lastWindowWidth);

            if (!isTabletLayout) { // desktop mode
                $("#navigation").removeAttr("role");
                $("body").removeClass("active");
                $("body").addClass("web");

                if (wasTabletLayout) {
                    GoHome();
                }

                // Bug fix #83772. Fixed tabs losing active class in desktop layout
                if ($lastActiveTab) {
                    var $activeTab = $($lastActiveTab);

                    // check if any tab has 'active' on it
                    if (!$activeTab.hasClass("active")) {
                        var $activeLi = $activeTab.find("li");
                        var $li = $($activeLi[0]);

                        $li.removeClass('tabs-nav-inactive');
                        $li.addClass("tabs-nav-active");
                        $activeTab.addClass("active");
                    }
                }
                else if (!$lastActiveTab && $(document).find(".tab.active").length == 0) {
                    $lastActiveTab = $($(document).find(".tab")[0]);
                    SetActivePane("Toc", $lastActiveTab);
                }
            }
            else { // tablet mode
                if ($("#navigation").attr("role") !== 'undefined')
                    $("#navigation").attr("role", "complementary");

                if (!wasTabletLayout) {
                    var $activeTab = $('.tab.active');
                    $lastActiveTab = $activeTab.length && $activeTab.find('li').text() != "SearchTab" ? $('.tab.active') : $lastActiveTab;
                    $('.tab .tabs-nav-active').removeClass('tabs-nav-active');
                    $('.tabs-nav li').addClass('tabs-nav-inactive');
                    $('.tab.active').removeClass('active');
                }

                $("body").removeClass("web");
            }

            // only want to restore panes if it goes from desktop to mobile/tablet or vice versa
            if ((isTabletLayout && !wasTabletLayout) || (!isTabletLayout && wasTabletLayout)) {
                RestorePanes();
            }
        }
        AdjustTabs(parseInt($("#navigation").css("width")));
        lastWindowWidth = windowWidth;
    }, 50);

    function RestorePanes() {
        var panePos = $(document.documentElement).hasClass("left-layout") ? "left" : $(document.documentElement).hasClass("right-layout") ? "right" : "left";

        var $navigation = $("#navigation");
        var $contentBody = $("#contentBody");
        var $navResizeBar = $("#navigationResizeBar");

        var noStyle = !$navigation.attr('style') || !$contentBody.attr('style');
        var noLastWidth = !$navigation.attr('data-mc-last-width') || !$contentBody.attr('data-mc-last-width');

        if (noStyle && noLastWidth)
            return;

        if (!_HelpSystem.IsTabletLayout()) {
            var navWidth = $navigation.attr("data-mc-last-width");
            if (navWidth) {
                $navigation.css("width", navWidth);

                var contentWidth = $contentBody.attr("data-mc-last-width");
                if (contentWidth)
                    $contentBody.css(panePos, contentWidth);
            }
        }
        else {
            var navWidth = $navigation.css("width");
            if (navWidth) {
                $navigation.attr("data-mc-last-width", navWidth);

                $navigation.removeAttr("style");

                var contentWidth = $contentBody.css(panePos);
                if (contentWidth)
                    $contentBody.attr("data-mc-last-width", contentWidth);

                $contentBody.removeAttr("style");
            }
        }
    }

    function Window_Onhashchange(e) {
        MadCap.DEBUG.Log.AddLine(window.name + "onhashchange: " + document.location.hash);

        if (document.location.hash.length > 1)
            LoadFromHash();
        else
            LoadFile(_HelpSystem.DefaultStartTopic);
    }

    function InitCommunityFeatures() {
        // Set up topic rating mouse click event
        $(".star-buttons").click(FeedbackRating_Click);

        // Set the login/edit user profile button depending if the user is logged in
        UpdateLoginButton();

        $(".buttons").on("click", ".login-button", function (e) {
            if (isSkinPreview) {
                MadCap.Utilities.SetButtonState($(".login-button"), 2);
            }
            else {
                _LoginDialog = new MadCap.Feedback.LoginDialog(_FeedbackController, _FeedbackController.PulseEnabled ? "pulse" : "new");

                if (!_FeedbackController.PulseEnabled) {
                    $(_LoginDialog).bind("closed", function () {
                        UpdateLoginButton();
                    });
                }

                _LoginDialog.Show();
            }
        });

        $(".buttons").on("click", ".edit-user-profile-button", function (e) {
            if (isSkinPreview) {
                MadCap.Utilities.SetButtonState($(".edit-user-profile-button"), 1);
            }
            else {
                if (_FeedbackController.PulseEnabled) {
                    var hash = '#!streams/' + (isTriPane ? _FeedbackController.PulseUserGuid + '/settings' : 'my');
                    NavigateStream(hash);
                }
                else {
                    _LoginDialog = new MadCap.Feedback.LoginDialog(_FeedbackController, "edit");

                    $(_LoginDialog).bind("closed", function () {
                        UpdateLoginButton();
                    });

                    _LoginDialog.Show();
                }
            }
        });
    }

    function SearchFormSubmit(e) {
        var searchQuery = GetSearchQuery(e);

        if (!MadCap.String.IsNullOrEmpty(searchQuery.Query)) {
            var searchModifier = _searchPrefix + searchQuery.ToString();

            if (isTriPane) {
                document.location.hash = searchModifier;
            }
            else {
                MadCap.Utilities.Url.NavigateTopic(new MadCap.Utilities.Url(_HelpSystem.SearchUrl + "#" + searchModifier));
            }
        }
    }

    function GetSearchQuery(e) {
        var $searchBar = $(e.target).closest(".search-bar-container");
        var $searchField = $("input", $searchBar).first();
        var $searchFilter = $(".search-filter", $searchBar);

        var searchQuery = $searchField.val();
        if (searchQuery) {
            searchQuery = MadCap.Utilities.Url.StripInvalidCharacters(searchQuery);
            searchQuery = encodeURIComponent(searchQuery);
        }

        var searchFilterText;
        var searchBarId = $searchBar.attr('id');

        if (isTriPane && searchBarId && searchBarId.indexOf('sidebar') != -1)
            searchFilterText = $('.SearchFilterEntry.tree-node-selected').text();
        else
            searchFilterText = $searchFilter.data('filter');

        if (!searchFilterText) {
            var hash = MadCap.Utilities.Url.CurrentHash();
            var index = hash.lastIndexOf('?f=');
            if (index !== -1) {
                var filter = hash.substr(index + 3); // 3 = 2 (positions til =) + 1 (start of filter)

                if (filter)
                    searchFilterText = filter;
            }
        }

        searchFilterText = searchFilterText ? searchFilterText.trim() : searchFilterText;

        var searchFilter = GetSearchFilterValue(searchFilterText, $searchBar);

        return new MadCap.WebHelp.Search.SearchQuery(searchQuery, searchFilter, null);
    }

    function GetSearchFilterValue(searchFilter, context) {
        var defaultSearchFilter = $.trim($(".search-filter li", context).first().text());
        if (searchFilter && searchFilter != defaultSearchFilter)
            return MadCap.Utilities.Url.StripInvalidCharacters(searchFilter);

        return null;
    }

    function DoSearchOrRedirect(query, skinName) {
        var searchQuery = MadCap.WebHelp.Search.SearchQuery.Parse(query);

        if (!isTriPane && !MadCap.Utilities.HasRuntimeFileType("Search")) {
            var skinQuery = "";
            if (skinName)
                skinQuery = "?skinName=" + skinName;
            MadCap.Utilities.Url.NavigateTopic(new MadCap.Utilities.Url(_HelpSystem.SearchUrl + skinQuery + "#" + _searchPrefix + searchQuery.ToString()));
        }
        else {
            // set the value of the search field. This needs to happen when the search originated directly from the URL rather than by typing in the search field and submitting.
            SetSelectedSearchQuery(searchQuery.Query);

            if (!MadCap.String.IsNullOrEmpty(searchQuery.Filter)) {
                SetSelectedSearchFilter(searchQuery.Filter);
                UpdateSearchFilterState(searchQuery.Filter, document);
            }

            DoSearch(searchQuery.Query, searchQuery.Filter, searchQuery.PageIndex);
        }
    }

    function RedoSearch(searchQuery, searchFilter) {
        if (!isTriPane && isSkinPreview)
            return;

        // if the search pane is currently active, redo the search to refresh the search results with the new filter applied
        if ($("#searchPane").is(":visible") && !MadCap.String.IsNullOrEmpty(searchQuery))
            SetSearchHash(new MadCap.WebHelp.Search.SearchQuery(searchQuery, GetSearchFilterValue(searchFilter), null));
    }

    function DoSearch(searchQuery, filterName, resultStartNum, searchTopics, searchCommunity, communityPageSize, communityPageIndex) {
        var currentSkin = _HelpSystem.GetCurrentSkin();
        if (typeof searchTopics == "undefined")
            searchTopics = true;
        if (typeof searchCommunity == "undefined")
            searchCommunity = (!currentSkin && _HelpSystem.DisplayCommunitySearchResults) ||
                              (currentSkin && currentSkin.DisplayCommunitySearchResults != "false");
        if (typeof communityPageSize == "undefined")
            communityPageSize = _HelpSystem.CommunitySearchResultsCount;
        if (typeof communityPageIndex == "undefined")
            communityPageIndex = 0;

        if (!resultStartNum)
            resultStartNum = 1;

        $("#resultList").remove();
        ShowPane("search");

        var isFirstPage = resultStartNum === 1;
        var options = {};

        if (searchTopics) {
            options.searchContent = true;
            options.searchGlossary = _HelpSystem.IncludeGlossarySearchResults && isFirstPage;
            options.content = { filterName: filterName };
        }

        if (searchCommunity && (isFirstPage || !searchTopics)) {
            options.searchCommunity = true;
            options.community = { pageSize: communityPageSize, pageIndex: communityPageIndex };
        }

        _SearchPane.Search(searchQuery, options).then(function (results) {
            BuildSearchResults(searchQuery, results, resultStartNum);
        });

        // show search results
        $("body").removeClass("active");
    }

    function CreateSearchPagination(curPage, results) {
        var paginationDiv = $("#pagination");

        // hide search pagination
        paginationDiv.css("display", "none");

        // clear previous links
        $('a.specificPage', paginationDiv).remove();

        // create search results pagination div
        var resultsLength = results.length;

        if (resultsLength > 0) {
            
            var totalPages = Math.ceil(resultsLength / _HelpSystem.ResultsPerPage);
            var maxPagesShown = 10;
            var slidingStartPoint = 5;
            var pageStart = Math.max(Math.min(curPage - slidingStartPoint, totalPages - maxPagesShown + 1), 1);
            var pageEnd = Math.min(pageStart + maxPagesShown - 1, totalPages);

            var previousLink = $("a.previousPage", paginationDiv);
            if (curPage > 1) {
                previousLink.off("click");
                previousLink.on("click", { value: curPage - 1 }, GoToSearchResults);
                previousLink.css("display", "inline");
            }
            else {
                previousLink.css("display", "none");
            }

            var nextLink = $("a.nextPage", paginationDiv);
            if (curPage < totalPages) {
                nextLink.off("click");
                nextLink.on("click", { value: curPage + 1 }, GoToSearchResults);
                nextLink.css("display", "inline");
            }
            else {
                nextLink.css("display", "none");
            }

            for (var i = pageStart; i <= pageEnd; i++) {
                var pageLink = $("<a class='specificPage'>" + i + "</a>");

                if (i == curPage)
                    pageLink.attr('id', 'selected');

                nextLink.before(pageLink);
                pageLink.on("click", { value: i }, GoToSearchResults);
            }

            paginationDiv.css("display", "block");
        }
    }

    function GoToSearchResults(e) {
        e.preventDefault();
        
        var searchPrefix = '#' + _searchPrefix;
        var hash = MadCap.Utilities.Url.CurrentHash();

        if (hash.indexOf(searchPrefix) == 0) {
            var searchQuery = MadCap.WebHelp.Search.SearchQuery.Parse(hash.substring(searchPrefix.length));
            searchQuery.PageIndex = e.data.value;

            SetSearchHash(searchQuery);
        }
    }

    function SetSearchHash(searchQuery, searchFilter, pageIndex) {
        var searchQueryString = searchQuery.ToString();
        searchQueryString = MadCap.Utilities.Url.StripInvalidCharacters(searchQueryString);

        document.location.hash = '#' + _searchPrefix + searchQueryString;
    }

    // curPage is the clicked on page number
    // resultsPerPage is the number of results shown per page
    function BuildSearchResults(searchQuery, results, curPage) {
        var currentSkin = _HelpSystem.GetCurrentSkin();
        var displayCommunityResults = (!currentSkin && _HelpSystem.DisplayCommunitySearchResults) ||
                                      (currentSkin && currentSkin.DisplayCommunitySearchResults != "false");
        var headingEl = $("#results-heading")[0];
        var paginationEl = $("#pagination");
        var length = results.content != null ? results.content.length : 0;
        var communityLength = (displayCommunityResults && results.community != null) ? results.community.TotalRecords : 0;
        var glossaryLength = results.glossary ? 1 : 0;
        var totalLength = length + communityLength + glossaryLength;
        var linkPrefix = isTriPane ? "#" : "";

        SetSkinPreviewStyle(headingEl, "Search Heading");

        $(".query", headingEl).text("\"" + decodeURIComponent(searchQuery) + "\"");
        $(".total-results", headingEl).text(totalLength);

        if (curPage < 1 || curPage > Math.ceil(length / _HelpSystem.ResultsPerPage)) {
            paginationEl.css("display", "none");
        }

        if (totalLength > 0) {
            var ul = document.createElement("ul");
            ul.setAttribute("id", "resultList");

            if (!results.content)
                ul.setAttribute("class", "communitySearch");

            // glossary result
            if (results.glossary) {
                var li = document.createElement("li");
                ul.appendChild(li);

                var div = document.createElement("div");
                $(div).addClass("glossary");
                SetSkinPreviewStyle(div, "Search Glossary Result");

                var divTerm = document.createElement("div");
                $(divTerm).addClass("term");
                SetSkinPreviewStyle(divTerm, "Search Glossary Term");
                var term = document.createTextNode(results.glossary.term);

                if (results.glossary.link) { // term links to a topic
                    var linkTerm = document.createElement("a");
                    $(linkTerm).attr("href", linkPrefix + results.glossary.link);
                    linkTerm.appendChild(term);
                    divTerm.appendChild(linkTerm);
                }
                else {
                    divTerm.appendChild(term);
                }

                div.appendChild(divTerm);

                var definition = results.glossary.definition || results.glossary.abstractText;
                if (definition) {
                    var divDef = document.createElement("div");
                    $(divDef).addClass("definition");
                    divDef.appendChild(document.createTextNode(definition));
                    SetSkinPreviewStyle(divDef, "Search Glossary Definition");
                    div.appendChild(divDef);
                }

                li.appendChild(div);
            }

            if (results.community != null && results.community.Activities.length > 0 && displayCommunityResults) {
                BuildCommunitySearchResults(ul, searchQuery, results.community);
            }

            var resultsLength = _HelpSystem.ResultsPerPage;
            if (results.content != null && resultsLength > 0) {
                var startResultIndex = (curPage - 1) * resultsLength;
                var endResultIndex = Math.min(startResultIndex + resultsLength, results.content.length);

                for (var i = startResultIndex; i < endResultIndex; i++) {
                    var result = results.content[i];
                    var title = result.Title;
                    var link = result.Link;
                    var abstractText = result.AbstractText;

                    var li = document.createElement("li");
                    ul.appendChild(li);

                    var h3 = document.createElement("h3");
                    $(h3).addClass("title");
                    li.appendChild(h3);

                    var a = document.createElement("a");
                    a.setAttribute("href", linkPrefix + link + "?Highlight=" + searchQuery);
                    SetSkinPreviewStyle(a, "Search Result Link");
                    a.appendChild(document.createTextNode(title));
                    BoldSearchTerms(a, results.includedTerms);
                    h3.appendChild(a);

                    if (abstractText != null) {
                        var divDesc = document.createElement("div");
                        $(divDesc).addClass("description");
                        SetSkinPreviewStyle(divDesc, "Search Result Abstract");
                        divDesc.appendChild(document.createTextNode(abstractText));
                        BoldSearchTerms(divDesc, results.includedTerms);
                        li.appendChild(divDesc);
                    }

                    //var divScore = document.createElement("div");
                    //$(divScore).addClass("score");
                    //divScore.appendChild(document.createTextNode(result.Score));
                    //li.appendChild(divScore);

                    var divUrl = document.createElement("div");
                    $(divUrl).addClass("url");
                    li.appendChild(divUrl);

                    var cite = document.createElement("cite");
                    SetSkinPreviewStyle(cite, "Search Result Path");
                    cite.appendChild(document.createTextNode(link));
                    divUrl.appendChild(cite);
                }
            }

            paginationEl.before(ul);
        }

        if (_HelpSystem.LiveHelpEnabled) {
            _FeedbackController.LogSearch(_HelpSystem.LiveHelpOutputId, null, length, null, searchQuery);
        }

        if (length > _HelpSystem.ResultsPerPage)
            CreateSearchPagination(curPage, results.content);
        else
            paginationEl.css("display", "none");

        // Bug #99223 - Cannot scroll search results on iOS on initial load
        if (MadCap.IsIOS())
            $('.off-canvas-wrap').scrollTop(1);

        // scroll to top
        $("#contentBodyInner, .off-canvas-wrap").scrollTop(0);

        // focus first result (closes keyboard on mobile devices)
        $('#resultList a').first().focus();
    }

    function SetSkinPreviewStyle(el, styleName) {
        if (isSkinPreview)
            el.setAttribute("data-mc-style", styleName);
    }

    function BoldSearchTerms(parentNode, terms) {
        var $parentNode = $(parentNode);

        if (terms) {
            for (var i = 0; i < terms.length; i++) {
                $parentNode.highlight(terms[i], null, 'b');
            }
        }
    }

    function BuildCommunitySearchResults(ul, searchQuery, communityResults) {
        var linkPrefix = (_HelpSystem.PulsePage || "") + "#pulse-";
        var topicPrefix = isTriPane ? "#" : _HelpSystem.GetTopicPath("../" + _HelpSystem.ContentFolder).FullPath;

        var li = document.createElement("li");
        li.setAttribute("id", "community-results");
        ul.appendChild(li);

        var h3 = document.createElement("h3");
        h3.setAttribute("class", "title");

        var communitySearchLink = document.createElement("a");
        communitySearchLink.setAttribute("href", "#communitysearch-" + searchQuery);
        communitySearchLink.appendChild(document.createTextNode("Community Results"));

        h3.appendChild(communitySearchLink);

        var communitySearchInfo = document.createElement("span");
        communitySearchInfo.appendChild(document.createTextNode(" (" + communityResults.TotalRecords + ")"));
        h3.appendChild(communitySearchInfo);

        var communityUl = document.createElement("ul");
        communityUl.setAttribute("id", "communityResultList");

        li.appendChild(h3);
        li.appendChild(communityUl);

        var now = new Date();
        var utcNow = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());

        for (var i = 0; i < communityResults.Activities.length; i++) {
            var communityResult = communityResults.Activities[i];

            var communityLi = document.createElement("li");
            communityUl.appendChild(communityLi);

            var communityLink = document.createElement("a");
            communityLink.setAttribute("class", "activityText");
            communityLink.setAttribute("href", linkPrefix + "#!streams/" + communityResult.FeedId + "/activities/" + communityResult.Id);
            communityLink.appendChild(document.createTextNode(communityResult.Text));

            var communityLinkInfo = document.createElement("div");
            communityLinkInfo.setAttribute("class", "activityInfo");

            var createdByA = document.createElement("a");
            createdByA.setAttribute("class", "activityCreator");
            createdByA.setAttribute("href", linkPrefix + "#!streams/" + communityResult.CreatedBy + "/activities");
            createdByA.appendChild(document.createTextNode(communityResult.CreatedByDisplayName));

            var toSpan = document.createElement("span");
            toSpan.appendChild(document.createTextNode(" to "));

            var feedUrl = communityResult.FeedUrl != null ? topicPrefix + communityResult.FeedUrl : linkPrefix + "#!streams/" + communityResult.FeedId + "/activities";

            var pageA = document.createElement("a");
            pageA.setAttribute("class", "activityFeed");
            pageA.setAttribute("href", feedUrl);
            pageA.appendChild(document.createTextNode(communityResult.FeedName));

            var postedOn = new MadCap.Utilities.DateTime(communityResult.PostedUtc);
            var postedTimeSpan = new MadCap.Utilities.TimeSpan(postedOn.Date, utcNow);

            var postedOnSpan = document.createElement("span");
            postedOnSpan.setAttribute("class", "activityTime");
            postedOnSpan.appendChild(document.createTextNode(postedTimeSpan.ToDurationString()));

            communityLinkInfo.appendChild(createdByA);
            communityLinkInfo.appendChild(toSpan);
            communityLinkInfo.appendChild(pageA);
            communityLinkInfo.appendChild(postedOnSpan);

            communityLi.appendChild(communityLink);
            communityLi.appendChild(communityLinkInfo);
        }
    }

    function NavigationResizeBar_MouseDown(e) {
        MadCap.DEBUG.Log.AddLine("nav resizeBar : mousedown");

        if ($(e.target).attr("id") == "show-hide-navigation")
            return;

        if ($(this).hasClass("nav-closed"))
            return;

        var sheetEl = document.createElement("div");
        sheetEl.setAttribute("id", "mousemove-sheet");
        document.body.appendChild(sheetEl);

        $(document).mousemove(NavigationResizeBar_MouseMove);
        $(document).mouseup(NavigationResizeBar_MouseUp);
        $(document).bind("selectstart", NavigationResizeBar_SelectStart); // For IE 8 and below only. Prevent text selection.

        e.preventDefault(); // prevent text selection
    }

    function NavigationResizeBar_SelectStart(e) {
        return false;
    }

    function NavigationResizeBar_MouseMove(e) {
        MadCap.DEBUG.Log.AddLine("nav resizeBar : mousemove : " + e.pageX);

        var panePos = $(document.documentElement).hasClass("left-layout") ? "left" : $(document.documentElement).hasClass("right-layout") ? "right" : "left";
        var width = e.pageX;

        if (panePos == "right")
            width = window.innerWidth - e.pageX;

        ResizeNavigation(width);
    }

    function NavigationResizeBar_MouseUp(e) {
        MadCap.DEBUG.Log.AddLine("nav resizeBar : mouseup");

        $(document).off("mousemove", NavigationResizeBar_MouseMove);
        $(document).off("mouseup", NavigationResizeBar_MouseUp);
        $(document).off("selectstart", NavigationResizeBar_SelectStart);

        // IE needs this in a setTimeout(). Otherwise, you need to click the mouse again before you can select text, resize the resize bar, etc.
        var sheetEl = $("#mousemove-sheet")[0];
        window.setTimeout(function () { sheetEl.parentNode.removeChild(sheetEl); }, 1);
    }

    function ResizeNavigation(width) {
        var panePos = $(document.documentElement).hasClass("left-layout") ? "left" : $(document.documentElement).hasClass("right-layout") ? "right" : "left";

        if (panePos == "left") {
            if (width < 175 || width > (window.innerWidth * 0.85))
                return;
        }
        else if (panePos == "right") {
            if (width < (window.innerWidth * 0.15) || width > (window.innerWidth - 175))
                return;
        }

        AdjustTabs(width);

        $("#navigationResizeBar").css(panePos, width + "px");
        $("#navigation").css("width", width + "px");
        $("#contentBody").css(panePos, (width + 5) + "px")
    }

    function AdjustTabs(width) {
        var tabs = $(".tabs-nav li");
        if (CalculateTabsWidth() === 0) return;

        $.each(tabs, function (index, item) {
            var li = $(item);
            if (li.hasClass("tab-collapsed"))
                li.removeClass("tab-collapsed");
        });
        if (width < CalculateTabsWidth() + 4) {
            for (var index = tabs.length - 1; index >= 0; index--) {
                var li = $(tabs[index]);
                li.addClass("tab-collapsed");
                if (width > CalculateTabsWidth() + 18) {
                    break;
                }
            }
        }
    }

    function CalculateTabsWidth() {
        var width = 0;
        var tabs = $(".tabs-nav li");
        tabs.each(function (index, li) {
            var tab = $(li);
            if (tab.is(':visible')) {
                width += parseInt(tab.css("width"));
            }
        });

        return width;
    }

    function GoHome() {
        var tabs = $(document).find('.tab');
        for (var i = 0; i < tabs.length; i++) {
            var $tab = $(tabs[i]);
            $tab.show();
            $tab.removeClass('active');
        }

        // reset search bar
        $("#search-sidebar").removeClass("index").removeClass("glossary");
        $(".tabs-nav-active").removeClass("tabs-nav-active");
        $(".tabs-nav li").addClass("tabs-nav-inactive");

        // reset index popups
        $(".responsive-link-list").remove();
    }

    function TopNavigationMenuItem_MouseEnter(e) {
        var $li = $(e.currentTarget).closest('li');
        var $subMenu = $li.children('ul').first();
        if ($subMenu.length) {
            var width = $subMenu.width();
            var isRtl = $('html').attr('dir') == 'rtl';
            var availWidth = isRtl ? $li.offset().left : $(window).width() - $li.offset().left - $li.width();
            var cssClass = isRtl ? 'openRight' : 'openLeft';

            $subMenu.toggleClass(cssClass, width > availWidth);
        }
    }

    function ShowHideNavigation_Click(e) {
        var $navigation = $("#navigation");

        if (!$navigation.hasClass("nav-closed"))
            ShowHideNavigation("hide");
        else
            ShowHideNavigation("show");
    }

    function ShowHideNavigation(which) {
        var panePos = $(document.documentElement).hasClass("left-layout") ? "left" : $(document.documentElement).hasClass("right-layout") ? "right" : "left";

        var $navigation = $("#navigation");
        var $navigationResizeBar = $("#navigationResizeBar");
        var $contentBody = $("#contentBody");

        if (which == "show") {
            $navigationResizeBar.css(panePos, $navigationResizeBar.attr("data-mc-last-width"));
            var contentBodyPos = $contentBody.attr("data-mc-last-width");
            // case for switching to responsive when nav pane is hidden
            if (contentBodyPos == $contentBody.css('left')) {
                contentBodyPos = $navigation.innerWidth() + $navigationResizeBar.innerWidth() + 1; // 1 for padding
                $contentBody.attr("data-mc-last-width", contentBodyPos + "px");
            }
            else {
                $contentBody.css(panePos, contentBodyPos);
            }

            $navigation.removeClass("nav-closed");
            $navigationResizeBar.removeClass("nav-closed");
            $contentBody.removeClass("nav-closed");

            if (_HelpSystem.IsResponsive)
                RestorePanes();
        }
        else if (which == "hide") {
            $contentBody.attr("data-mc-last-width", $contentBody.css(panePos)); // store current position
            //$contentBody.css(panePos, "5px");
            $contentBody.removeAttr("style");

            $navigationResizeBar.attr("data-mc-last-width", $navigationResizeBar.css(panePos)); // store current position
            $navigationResizeBar.css(panePos, 0);

            $navigation.attr("data-mc-last-width", $navigation.css('width')); // store current width

            $navigation.addClass("nav-closed");
            $navigationResizeBar.addClass("nav-closed");
            $contentBody.addClass("nav-closed");
        }
    }

    function LoadFromHash() {
        if (document.location.hash.length == 0)
            return;

        var currentUrl = MadCap.Utilities.Url.GetDocumentUrl();
        var hash = MadCap.Utilities.Url.CurrentHash();
        var path = MadCap.Utilities.Url.StripInvalidCharacters(hash);

        if (MadCap.String.IsNullOrEmpty(path)) {
            document.location.hash = "";
            return;
        }

        var encodedTopicPath = path.substring(1);
        var topicPath = decodeURIComponent(encodedTopicPath);
        topicPath = MadCap.Utilities.Url.StripInvalidCharacters(topicPath);

        if (MadCap.String.Contains(topicPath, "cshid=") || MadCap.String.Contains(topicPath, "searchQuery=") || MadCap.String.Contains(topicPath, "skinName=")) {
            LoadCshFromUrl();

            return;
        }
        else if (MadCap.String.StartsWith(encodedTopicPath, _searchPrefix)) {
            DoSearchOrRedirect(encodedTopicPath.substring(_searchPrefix.length), null);

            return;
        }
        else if (MadCap.String.StartsWith(topicPath, "communitysearch-")) {
            var searchQuery = topicPath.substring("communitysearch-".length);

            SetSelectedSearchQuery(searchQuery);

            DoSearch(searchQuery, null, 1, false, true, -1, 0);

            return;
        }
        else if (MadCap.String.StartsWith(topicPath, "pulse-")) {
            var pulsePath = topicPath.substring("pulse-".length);

            LoadStream(pulsePath);

            return;
        }

        LoadTopic(topicPath);
    }

    function LoadTopic(path) {
        /// <summary>Loads a topic into the topic pane.</summary>
        /// <param name="path">The path of the topic relative to the Content folder.</param>

        var pathUrl = new MadCap.Utilities.Url(path);

        if (pathUrl.IsAbsolute) {
            if (_HelpSystem.PreventExternalUrls) {
                path = _HelpSystem.DefaultStartTopic;
            }
            else {
                //external url support - in case such a url has a query, this will strip off just our query.
                var iq1 = pathUrl.Query.indexOf('?');
                var iq2 = pathUrl.Query.lastIndexOf('?');
                var query = '';
                if (iq1 != iq2) {
                    query = pathUrl.Query.substr(iq1, iq2);
                }
                if (pathUrl.FullPath.indexOf("http://") != 0) {
                    path = _HelpSystem.ContentFolder + pathUrl.ToNoQuery().FullPath + (MadCap.String.IsNullOrEmpty(query) ? "" : query);
                } else {
                    path = pathUrl.ToNoQuery().FullPath + (MadCap.String.IsNullOrEmpty(query) ? "" : query);
                }
            }
        } else
            path = _HelpSystem.ContentFolder + pathUrl.ToNoQuery().FullPath;

        LoadFile(path);
    }

    function LoadFile(path) {
        /// <summary>Loads a file into the topic pane.</summary>
        /// <param name="path">The path of the file.</param>
        if (!isDefault)
            return;

        var href = new MadCap.Utilities.Url(decodeURIComponent(document.location.href));

        if (!isTriPane) {
            var root = new MadCap.Utilities.Url(href.PlainPath);
            if (!root.IsFolder)
                root = root.ToFolder();
            var url = root.CombinePath(path);

            MadCap.Utilities.Url.Navigate(url.FullPath);
        }
        else {
            $(document.documentElement).addClass('has-topic');

            ShowPane("topic");

            // IE9 Bug for loading pdfs into a frame workaround
            // http://www.digiblog.de/2011/08/ie9-bug-loading-pdfs-into-frames-using-javascript/
            try {
                //conditional tries on msie fail due to the trident signature in newer IE
                frames["topic"].location.replace(path);
            } catch (err) {
                document.getElementById("topic").src = path;
            }

            var tocType = null, tocPath = null, bsPath = null;

            if (!MadCap.String.IsNullOrEmpty(href.Fragment) && href.Fragment.length > 1) {
                tocPath = href.QueryMap.GetItem('TocPath');

                if (tocPath != null) {
                    tocType = 'Toc';
                }
                else {
                    bsPath = href.QueryMap.GetItem('BrowseSequencesPath');

                    if (bsPath != null) {
                        tocType = 'BrowseSequences';
                    }
                }

                if (href.HashMap.GetItem('cshid') == null) {
                    var iq1 = href.Query.indexOf('?');
                    var iq2 = href.Query.lastIndexOf('?');
                    var query = '';
                    if (iq1 != iq2) {
                        query = href.Query.substr(iq1, iq2);
                    }
                    href = new MadCap.Utilities.Url(href.Fragment.substr(1));
                    if (!MadCap.String.IsNullOrEmpty(query)) {
                        href.Query = query;
                    }
                }
            }
            else {
                href = new MadCap.Utilities.Url(_HelpSystem.DefaultStartTopic).ToRelative(_HelpSystem.GetContentPath());
            }

            _HelpSystem.SetBrowseSequencePath(bsPath, href);

            if (_HelpSystem.SyncTOC) {
                MadCap.Utilities.CrossFrame.PostMessageRequest(parent, 'sync-toc', [tocType, tocType == 'Toc' ? tocPath : bsPath, href.FullPath], null);
            }
        }
    }

    function LoadStream(url) {
        /// <summary>Loads a stream into the Pulse pane.</summary>
        /// <param name="url">The stream url.</param>

        $(document.documentElement).removeClass('has-topic');

        ShowPane("pulse");

        var hash = url.substring(url.indexOf('#'));

        MadCap.Utilities.CrossFrame.PostMessageRequest(frames["community-frame-html5"], "pulse-hash-changed", [hash]);

        _FeedbackController.Init(function () {
            if (_FeedbackController.PulseActive && GetPulseFrame())
                GetPulseFrame().location.replace(_FeedbackController.PulseServer +hash);
        });
    }

    function NavigateStream(url) {
        /// <summary>Navigates the help system to a stream.</summary>
        /// <param name="url">The stream url.</param>

        var hash = 'pulse-' + url;

        if (_HelpSystem.PulsePage != null)
            MadCap.Utilities.Url.Navigate(_HelpSystem.PulsePage + '#' + hash);
        else
            MadCap.Utilities.Url.NavigateHash(hash);
    }

    function LoadSkinFromQuery() {
        var url = MadCap.Utilities.Url.GetDocumentUrl();
        var skinName = url.QueryMap.GetItem("skinName");
        ApplySkinByName(skinName);
    }

    function LoadVarMap() {
        var url = new MadCap.Utilities.Url(document.location.href);
        var varMap = new MadCap.Utilities.Dictionary(true);

        $.each([url.QueryMap, url.HashMap], function (index, map) {
            map.ForEach(function (key, value) {
                varMap.Add(key, value);
            });
        });

        return varMap;
    }

    function LoadCshFromUrl() {
        var varMap = LoadVarMap();
        var searchQuery = varMap.GetItem("searchQuery".toLowerCase());
        var skinName = varMap.GetItem("skinName".toLowerCase());

        if (searchQuery != null) {
            SetSelectedSearchQuery(decodeURIComponent(searchQuery));

            var firstPick = MadCap.String.ToBool(varMap.GetItem("firstPick".toLowerCase()), false);

            if (firstPick) {
                _SearchPane.Search(searchQuery, { searchContent: true }).then(function (results) {
                    var content = results.content;
                    if (content.length >= 1)
                        LoadTopic(content[0].Link.replace(/^(Content)/,""));
                });
            }
            else {
                DoSearchOrRedirect(searchQuery, skinName);
            }
        }
        else {
            var cshid = varMap.GetItem("cshid");

            if (cshid != null) {
                _HelpSystem.LookupCSHID(cshid, function (idInfo) {
                    var varMap = LoadVarMap();
                    var cshid = varMap.GetItem("cshid");
                    var skinName = varMap.GetItem("skinName".toLowerCase());

                    if (idInfo.Found) {
                        var topicPath = idInfo.Topic;
                        var topicPathUrl = new MadCap.Utilities.Url(topicPath);
                        var url = MadCap.Utilities.Url.GetDocumentUrl();
                        var query = "?cshid=" + cshid;
                        query += skinName ? "&skinName=" + skinName : "";

                        topicPath = new MadCap.Utilities.Url(topicPathUrl.PlainPath + query + topicPathUrl.Fragment).FullPath;

                        LoadFile(topicPath);
                    }
                    else
                        LoadFile(_HelpSystem.DefaultStartTopic);

                    ApplySkinByName(skinName || idInfo.Skin);
                });

                return;
            }
            else {
                var url = MadCap.Utilities.Url.GetDocumentUrl();
                LoadFile(_HelpSystem.DefaultStartTopic + url.Fragment);
            }

        }

        ApplySkinByName(skinName);
    }

    function GetPulsePathFromHash() {
        var hash = MadCap.Utilities.Url.CurrentHash();
        if (hash.indexOf("#pulse-") != 0)
            return "";

        return hash.substring("#pulse-".length);
    }

    function ApplySkinByName(skinName) {
        var skin = null;
        if (skinName != null) {
            var skin = _HelpSystem.GetSkin(skinName);
            if (!skin)
                skin = _HelpSystem.GetSkinByName(skinName);
        }

        if (!skin)
            skin = _HelpSystem.DefaultSkin;

        ApplySkin(skin);
    }

    function ApplySkin(skin) {
        if (skin == null)
            return;

        SetSize(skin);

        if (!MadCap.String.IsNullOrEmpty(skin.Tabs)) {
            if (skin.WebHelpOptions != null && skin.WebHelpOptions.HideNavigationOnStartup != null && (MadCap.String.ToBool(skin.WebHelpOptions.HideNavigationOnStartup, false)))
                ShowHideNavigation("hide");

            if (skin.HideNavOnStartup != null) {
                if (MadCap.String.ToBool(skin.HideNavOnStartup, false)) {
                    ShowHideNavigation("hide");
                    $("#contentBody").attr("data-mc-last-width", "");
                    $("#navigation").attr("data-mc-last-width", "");
                    $("#navigationResizeBar").attr("data-mc-last-width", "");
                } else {
                    ShowHideNavigation("show");
                }
            }

            if (GetPanePosition(skin) == "Right" && !isSkinPreview)
                $(document.documentElement).removeClass("left-layout").addClass("right-layout");

            if (skin.NavigationPaneWidth != null) {
                var navWidth = MadCap.String.ToInt(skin.NavigationPaneWidth, 300);

                ResizeNavigation(navWidth);
            }

            var tabs = skin.Tabs.split(",");
            var allTabs = ["Toc", "Index", "Glossary", "BrowseSequences", "Community"];
            var $tabsEl = $(".tabs");

            for (var i = 0, length = allTabs.length; i < length; i++) {
                var tab = allTabs[i];

                var $tab = $("#" + tab + "Tab");
                if ($tab.length == 0)
                    continue;

                if (tab == "Toc") tab = "TOC";

                if ($.inArray(tab, tabs) >= 0) {
                    $tab.css("display", "");
                    continue;
                }

                $tab.css("display", "none");

                var tabIndex = $tabsEl.children(".tabs-nav").children("li").index($tab); // can't use $tab.index() because CSS3PIE adds elements between the <li> elements in IE 8.
                var $panelEl = $tabsEl.children(".tabs-panels").children(":eq(" + tabIndex + ")");
                $tab.remove();
                $panelEl.remove();
            }

            var defaultTab = skin.DefaultTab;
            if (defaultTab == "TOC") defaultTab = "Toc";
            SetActivePane(defaultTab, $tabsEl);
            LoadPane(defaultTab);
        }

        if (skin.Toolbar != null && MadCap.String.IsNullOrEmpty(skin.Toolbar.Buttons)) {
            $(".buttons").remove();
        }

        if (!MadCap.String.IsNullOrEmpty(skin.Version) && parseInt(skin.Version) >= 2) {
            $.each(_HelpSystem.GetSkins(), function (i, s) {
                $("html").removeClass(s.SkinClass);
            });

            $("html").addClass(skin.SkinClass);

            // compute logo url relative to current page
            if (skin.LogoUrl) {
                var logoUrl = new MadCap.Utilities.Url(skin.LogoUrl);

                if (!logoUrl.IsAbsolute) {
                    var logoPath = _HelpSystem.GetPatchedPath(logoUrl.FullPath);
                    logoUrl = _HelpSystem.GetTopicPath("../" + _HelpSystem.ContentFolder + logoPath);
                }

                $("a.logo").attr("href", logoUrl.FullPath);
            }

            SwitchPanePosition(skin);
        }
    }

    function GetPanePosition(skin) {
        if (skin.WebHelpOptions != null && !(isTriPane && isSkinPreview)) // tripane skin preview always has pane positioned left
            return skin.WebHelpOptions.NavigationPanePosition;

        return "Left";
    }

    function SwitchPanePosition(skin) {
        var position = GetPanePosition(skin);

        if (isTriPane) {
            if (position == "Right") {
                $("html").removeClass("left-layout").addClass("right-layout");
            } else {
                $("html").removeClass("right-layout").addClass("left-layout");
            }
        } else {
            $("aside").hide();
            if (position == "Right") {
                $("a.menu-icon").removeClass("left-off-canvas-toggle").addClass("right-off-canvas-toggle");
                $("aside").removeClass("left-off-canvas-menu").addClass("right-off-canvas-menu");
                $(".off-canvas-list").attr("data-mc-css-sub-menu", "right-submenu");
            } else {
                $("a.menu-icon").removeClass("right-off-canvas-toggle").addClass("left-off-canvas-toggle");
                $("aside").removeClass("right-off-canvas-menu").addClass("left-off-canvas-menu");
                $(".off-canvas-list").attr("data-mc-css-sub-menu", "left-submenu");
            }
        }
    }


    function ShowPane(pane) {
        $("#topic").css("display", pane == "topic" ? "block" : "none");
        $("#topicContent").css("display", pane == "topic" ? "block" : "none");
        $("#pulse").css("display", pane == "pulse" ? "block" : "none");
        $("#searchPane").css("display", pane == "search" ? "block" : "none");
    }

    function GetPulseFrame() {
        if (frames["pulse"])
            return frames["pulse"];
        else if (frames["pulse-full"])
            return frames["pulse-full"];
        else
            return null;
    }

    var currentSelection = null
    function NavTabs_Click(e) {
        var tabID = $(this).attr("id");
        var name = tabID.substring(0, tabID.length - "Tab".length);
        currentSelection = name;

        SetActivePane(name, $(this).closest('.tabs'));

        if (_HelpSystem.IsTabletLayout() && _HelpSystem.IsResponsive) {
            var tabs = $(document).find('.tab');
            for (var i = 0; i < tabs.length; i++) {
                var $tab = $(tabs[i]);
                if (!$tab.hasClass('active')) {
                    $tab.hide();
                }
                else {
                    $tab.show();
                }
            }

            var $searchSidebar = $('#search-sidebar');
            var activeSearchClass = name.toLowerCase();
            $searchSidebar.removeClass('index').removeClass('glossary');
            if (activeSearchClass == 'index' || activeSearchClass == 'glossary') {
                $searchSidebar.addClass(activeSearchClass);
            }

        }

        // Load the pane
        LoadPane(name);
    }

    function SetActivePane(name, $tabsEl) {
        var $activeTabEl = $(".tabs-nav-active", $tabsEl);
        var $newActiveTab = $("#" + name + "Tab");
        var $currentActiveDiv = $activeTabEl.closest(".tab");
        var $newActiveDiv = $newActiveTab.closest(".tab");

        // set currently active tab to inactive
        $activeTabEl.removeClass("tabs-nav-active");
        $('.tabs-nav li').addClass('tabs-nav-inactive');

        // set currently active pane to inactive
        if ($currentActiveDiv != null)
            $currentActiveDiv.removeClass("active");

        // set new tab to active
        $newActiveTab.removeClass('tabs-nav-inactive');
        $newActiveTab.addClass("tabs-nav-active");

        // set new pane to active
        if ($newActiveDiv != null)
            $newActiveDiv.addClass("active");

        if (_HelpSystem.IsResponsive && name != "Search") {
            $lastActiveTab = $(".tab.active");
        }
        else {
            $lastActiveTab = null;
        }
    }

    function LoadMenus() {
        var $tocUls = $("ul[data-mc-toc]");
        $tocUls.each(function() {
            var tocPane = new MadCap.WebHelp.TocPane("Toc", _HelpSystem, this, false);
            tocPane.Init();
        });
    }

    function LoadDefaultPane() {
        var name = _HelpSystem.DefaultSkin.DefaultTab;

        if (name == "TOC")
            LoadPane("Toc");
        else
            LoadPane(name);
    }

    function LoadPane(name) {
        var pane = null;
        if (name == "Toc")
            pane = LoadToc();
        else if (name == "Index")
            pane = LoadIndex();
        else if (name == "Glossary")
            pane = LoadGlossary();
        else if (name == "BrowseSequences")
            pane = LoadBrowseSequences();
        else if (name == "Community")
            pane = LoadCommunity();

        if (pane || (pane && _HelpSystem.IsResponsive && !_HelpSystem.IsTabletLayout())) {
            SetActivePane(name, pane);
        }
    }

    function LoadToc() {
        if (_TocPane != null)
            return;

        var $pane = $("#toc");
        if (!$pane.length)
            return;

        $pane.addClass("loading");

        var $ul = $('<ul class="tree" />');
        $pane.append($ul);

        _TocPane = new MadCap.WebHelp.TocPane("Toc", _HelpSystem, $ul[0], true);
        _TocPane.Init(function () {
            $pane.removeClass("loading");
        });

        return $pane.parent();
    }

    function LoadIndex() {
        if (_IndexPane != null)
            return;

        var $pane = $("#index");
        $pane.addClass("loading");

        _IndexPane = new MadCap.WebHelp.IndexPane(_HelpSystem);
        _IndexPane.Init($("#index .index-wrapper")[0], function () {
            $pane.removeClass("loading");
        });

        return $pane.parent();
    }

    function LoadGlossary() {
        if (_GlossaryPane != null)
            return;

        var $pane = $("#glossary");
        $pane.addClass("loading");

        _GlossaryPane = new MadCap.WebHelp.GlossaryPane(_HelpSystem);
        _GlossaryPane.Init($pane[0], function () {
            $pane.removeClass("loading");
        });

        return $pane.parent();
    }

    function LoadBrowseSequences() {
        if (_BrowseSequencesPane != null)
            return;

        var $pane = $("#browseSequences");
        if (!$pane.length)
            return;

        $pane.addClass("loading");

        var $ul = $('<ul class="tree" />');
        $pane.append($ul);

        _BrowseSequencesPane = new MadCap.WebHelp.TocPane("BrowseSequences", _HelpSystem, $ul[0], true);
        _BrowseSequencesPane.Init(function () {
            $pane.removeClass("loading");
        });

        return $pane.parent();
    }

    function LoadCommunity() {
        if (_CommunityLoaded)
            return;

        _CommunityLoaded = true;

        var $comFrame = $("#community-frame-html5");

        _FeedbackController.Init(function () {
            if (_FeedbackController.PulseActive)
                $comFrame.attr("src", _FeedbackController.PulseServer + "streams/my");
        });

        return $comFrame.parent();
    }

    function SetSize(skin) {
        if (!skin) 
            return;

        var useDefaultSize = MadCap.String.ToBool(skin.UseBrowserDefaultSize, true);

        if (useDefaultSize)
            return;

        var topPx = MadCap.String.ToInt(skin.Top, 0);
        var leftPx = MadCap.String.ToInt(skin.Left, 0);
        var bottomPx = MadCap.String.ToInt(skin.Bottom, 0);
        var rightPx = MadCap.String.ToInt(skin.Right, 0);
        var widthPx = MadCap.String.ToInt(skin.Width, 800);
        var heightPx = MadCap.String.ToInt(skin.Height, 600);

        var anchors = skin.Anchors;

        if (anchors) {
            var aTop = (anchors.indexOf("Top") > -1) ? true : false;
            var aLeft = (anchors.indexOf("Left") > -1) ? true : false;
            var aBottom = (anchors.indexOf("Bottom") > -1) ? true : false;
            var aRight = (anchors.indexOf("Right") > -1) ? true : false;
            var aWidth = (anchors.indexOf("Width") > -1) ? true : false;
            var aHeight = (anchors.indexOf("Height") > -1) ? true : false;
        }

        if (aLeft && aRight)
            widthPx = screen.availWidth - (leftPx + rightPx);
        else if (!aLeft && aRight)
            leftPx = screen.availWidth - (widthPx + rightPx);
        else if (aWidth)
            leftPx = (screen.availWidth / 2) - (widthPx / 2);

        if (aTop && aBottom)
            heightPx = screen.availHeight - (topPx + bottomPx);
        else if (!aTop && aBottom)
            topPx = screen.availHeight - (heightPx + bottomPx);
        else if (aHeight)
            topPx = (screen.availHeight / 2) - (heightPx / 2);

        if (window == top) {
            window.resizeTo(widthPx, heightPx);
            window.moveTo(leftPx, topPx);
        }
    }

    function UpdateCommentsInTopic()
    {
        var currentSkin = _HelpSystem.GetCurrentSkin();
        if (currentSkin && currentSkin.CommentsInTopic == "false") {
            if (isTriPane) {
                MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "hide-comments");
            } else {
                $(".feedback-comments-wrapper").addClass("hidden");
            }
        } else {
            if (isTriPane) {
                MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "show-comments");
            } else {
                $(".feedback-comments-wrapper").removeClass("hidden");
            }
        }
    }

    function UpdateRating() {
        if (_FeedbackController == null)
            return;

        $(".star-buttons").addClass("loading");

        function UpdateAverageRating() {
            _FeedbackController.GetAverageRating(_TopicID, function (averageRating, ratingCount) {
                $(".star-buttons").removeClass("loading");

                SetFeedbackRating(averageRating);
            });
        }

        if (_TopicID == null) {
            GetTopicID(function (topicID) {
                _TopicID = topicID;

                SetFeedbackRating(0);
                UpdateAverageRating();
            });
        }
        else {
            UpdateAverageRating();
        }
    }

    function SetFeedbackRating(rating) {
        var $starContainer = $(".star-buttons");
        var $stars = $(".star-button", $starContainer);
        var starCount = $stars.length;
        var numIcons = Math.ceil(rating * starCount / 100);

        $stars.css("opacity", 0);

        for (var i = 0; i < starCount; i++) {
            var starButton = $stars[i];
            var $starButton = $(starButton);

            window.setTimeout((function (i, $starButton) {
                return function () {
                    if (i <= numIcons - 1)
                        MadCap.Utilities.SetButtonState($starButton[0], 2);
                    else
                        MadCap.Utilities.SetButtonState($starButton[0], 1);

                    $starButton.animate({ opacity: 1 });
                }
            })(i, $starButton), i * 50);
        }
    }

    function FeedbackRating_Click(e) {
        var $target = $(e.target);

        if (e.target.tagName == "IMG")
            $target = $target.closest(".star-button");

        if ($target.hasClass("star-button")) {
            var starCount = $(".star-button", this).length;
            var rating = ($target.index() + 1) * 100 / starCount;

            _FeedbackController.SubmitRating(_TopicID, rating, null, function () {
                UpdateRating();
            });
        }
    }

    function AdvanceTopic(moveType) {
        GetAdvanceUrl(moveType, function (href) {
            if (href) {
                if (isTriPane)
                    document.location.hash = href;
                else {
                    var contentFolder = _HelpSystem.GetMasterHelpsystem().GetContentPath();
                    var current = new MadCap.Utilities.Url(document.location.href);
                    var contentPath = current.ToFolder().CombinePath(contentFolder);
                    var currentSkin = _HelpSystem.GetCurrentSkin();
                    var skinQuery = _HelpSystem.DefaultSkin != currentSkin ? "?skinName=" + currentSkin.SkinID : "";

                    document.location.href = contentPath.CombinePath(href).FullPath + skinQuery;
                }
            }
        });
    }

    function PreviousTopic() {
        AdvanceTopic("previous");
    }

    function NextTopic() {
        AdvanceTopic("next");
    }

    function GetAdvanceUrl(moveType, CallBackFunc) {
        var win = isTriPane ? frames["topic"] : window;

        MadCap.Utilities.CrossFrame.PostMessageRequest(win, "get-topic-url", null, function (data) {
            var href = new MadCap.Utilities.Url(decodeURIComponent(data[0]));
            var root = new MadCap.Utilities.Url(decodeURIComponent(document.location.href));

            var tocPath = root.QueryMap.GetItem('TocPath');
            var bsPath = root.QueryMap.GetItem('BrowseSequencesPath');

            root = root.ToPlainPath();
            if (!root.IsFolder)
                root = root.ToFolder();

            var contentFolder = root.CombinePath(_HelpSystem.GetMasterHelpsystem().GetContentPath());
            href = href.ToRelative(contentFolder);

            if (bsPath != null) {
                _HelpSystem.AdvanceTopic("BrowseSequences", moveType, bsPath, isTriPane, href, CallBackFunc);
            } else {
                _HelpSystem.AdvanceTopic("Toc", moveType, tocPath, isTriPane, href, CallBackFunc);
            }
        });
    }

    function UpdateCurrentTopicIndex() {
        MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "get-bs-path", null, function (data) {
            function OnCompleteGetEntrySequenceIndex(sequenceIndex) {
                var $currentTopicIndex = $(".current-topic-index-button");

                if (sequenceIndex == -1) {
                    $currentTopicIndex.addClass("disabled");

                    return;
                }

                $currentTopicIndex.removeClass("disabled");

                $(".sequence-index").text(sequenceIndex);

                file.GetIndexTotalForEntry(bsPath, href, function (total) {
                    $(".sequence-total").text(total);
                });
            }

            var bsPath = data[0];
            var href = new MadCap.Utilities.Url(decodeURIComponenet(data[1]));
            var homeUrl = new MadCap.Utilities.Url(decodeURIComponent(document.location.href));
            homeUrl = new MadCap.Utilities.Url(homeUrl.PlainPath);
            var homeFolder = MadCap.String.EndsWith(homeUrl.FullPath, "/") ? homeUrl : homeUrl.ToFolder(); // Don't need .ToFolder() in the case that the page URL ends in a '/' (could happen when located on a web server: http://mydomain.com/WebHelp2/)
            href = href.ToRelative(homeFolder);

            if (bsPath != null) {
                var fullBsPath = _HelpSystem.GetFullTocPath("browsesequences", href.FullPath);

                if (fullBsPath)
                    bsPath = bsPath ? fullBsPath + "|" + bsPath : fullBsPath;
            }

            if (MadCap.String.IsNullOrEmpty(bsPath) || MadCap.String.StartsWith(bsPath, "_____")) {
                OnCompleteGetEntrySequenceIndex(-1);

                return;
            }

            var file = _HelpSystem.GetBrowseSequenceFile();
            file.GetEntrySequenceIndex(bsPath, href, OnCompleteGetEntrySequenceIndex);
        });
    }

    function UpdateLoginButton() {
        _UserGuid = _FeedbackController.GetUserGuid();

        var $el = $('.login-button');
        if ($el.length == 0)
            $el = $('.edit-user-profile-button');

        MadCap.Utilities.SetButtonState($el[0], _UserGuid == null ? 1 : 2);
    }

    function CloseLoginDialog() {
        if (_LoginDialog != null) {
            _LoginDialog.Hide(true);
        }
    }

    function LoadTopicContent(data) {
        // loads data into parent window
        var $topicContent = $("#topicContent");
        if ($topicContent.length == 0) {
            var iframeParent = $('#topic').parent();
            iframeParent.append("<div id='topicContent'></div>");
            $topicContent = $("#topicContent");
        }
        else {
            $topicContent.empty();
        }

        $topicContent.append(data[2]);

        var headArr = $(data[1]);
        var scripts = [], cssLinks = [], styleSheets = [];
        var topicUrl = new MadCap.Utilities.Url(data[0]);
        var documentUrl = new MadCap.Utilities.Url(document.location.href);
        var relUrl = documentUrl.ToFolder().ToRelative(topicUrl);

        $.each(headArr, function (index, item) {
            if (!MadCap.String.IsNullOrEmpty(item.localName)) {
                var localName = item.localName.toLowerCase();
                if (localName == 'script') {
                    var scriptUrl = new MadCap.Utilities.Url($(item).attr('src'));

                    if (!scriptUrl.IsAbsolute)
                        scriptUrl = scriptUrl.ToRelative(relUrl);

                    scripts.push(scriptUrl.FullPath);
                }
                else if (localName == 'link') {
                    styleSheets.push(item);
                }
            }
        });

        var relUrl2 = topicUrl.ToFolder().ToRelative(documentUrl.PlainPath);
        FixLinks(styleSheets, relUrl2, 'href'); // Find the correct url for these links, we want to go up as many levels as there are "../"'s
        $.each(styleSheets, function (index, item) {
            if ($(item).attr('mc-topic-css')) {
                var href = $(item).attr('href');
                href = href.replace('.css', '-topic.css');
                cssLinks.push(href);
            }
            else
                cssLinks.push($(item).attr('href'));
        });

        MadCap.Utilities.LoadStyleSheets(cssLinks, $('link[href*="Styles.css"]')[0]);
        MadCap.Utilities.LoadScripts(scripts, function () { }, function () { }, $topicContent);

        // reverse relative url for content it links to
        var docLoc = new MadCap.Utilities.Url(document.location.href);
        relUrl = topicUrl.ToFolder().ToRelative(docLoc.PlainPath);

        // fix link hrefs
        var $linksToFix = $topicContent.find('a[href][href!="javascript:void(0);"]');
        $linksToFix = $linksToFix.not('[class*="MCPopupThumbnailLink"]').not('[class*="MCTopicPopup"]');
        var $topicPopups = $topicContent.find('[class*="MCTopicPopup"]');
        var $thumbnailsToFix = $topicContent.find('a[class="MCPopupThumbnailLink"]');
        var $imagesToFix = $topicContent.find('img[src]');
        var $imageMapsToFix = $topicContent.find('area[href]');

        FixLinks($linksToFix, relUrl, 'href', '#');
        FixLinks($topicPopups, relUrl, 'href');
        FixLinks($imagesToFix, relUrl, 'src');
        FixLinks($thumbnailsToFix, relUrl, 'href');
        FixLinks($imageMapsToFix, relUrl, 'href', '#');

        // Bug fix #89522 - Always hide navigation links in this case (loading into div#topicContent)
        $(".MCWebHelpFramesetLink", $topicContent).hide();
    }

    function FixLinks(links, relUrl, attribute, prefix) {
        $.each(links, function (index, item) {
            var $item = $(item);
            var href = new MadCap.Utilities.Url($item.attr(attribute));

            if (!href.IsAbsolute) {
                var path = MadCap.Utilities.FixLink(href, relUrl, prefix, _HelpSystem.ContentFolder);
                $item.attr(attribute, path);
            }
        });
    }

    MadCap.Utilities.CrossFrame.AddMessageHandler(function (message, dataValues, responseData, messageSource, messageID) {
        var returnData = { Handled: false, FireResponse: true };

        if (message == "get-href") {
            responseData[responseData.length] = document.location.href;

            //

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        if (message == "get-return-url") {
            var url = new MadCap.Utilities.Url(document.location.href);
            var returnUrl = null;

            if (url.Fragment.length > 1) {
                var href = new MadCap.Utilities.Url(url.Fragment.substring(1));
                returnUrl = url.QueryMap.GetItem('returnUrl');
            }

            responseData[responseData.length] = returnUrl;

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "navigate") {
            var path = dataValues[0];

            if (path)
                MadCap.Utilities.Url.NavigateHash(path);

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "navigate-topic") {
            var path = dataValues[0];

            if (!isTriPane) {
                var abs = _HelpSystem.GetAbsoluteTopicPath("../" + _HelpSystem.ContentFolder + path);
                MadCap.Utilities.Url.Navigate(abs.FullPath);
            }

            var href = new MadCap.Utilities.Url(path);

            if (href.IsAbsolute) {
                // path will be absolute so make it relative to the home folder
                var homeUrl = new MadCap.Utilities.Url(document.location.href);
                homeUrl = new MadCap.Utilities.Url(homeUrl.PlainPath);
                var homeFolder = MadCap.String.EndsWith(homeUrl.FullPath, "/") ? homeUrl : homeUrl.ToFolder(); // Don't need .ToFolder() in the case that the page URL ends in a '/' (could happen when located on a web server: http://mydomain.com/WebHelp2/)
                var contentFolder = homeFolder.CombinePath(_HelpSystem.ContentFolder);
                href = href.ToRelative(contentFolder);
            }
            
            if (href.FullPath) {
                var newHash = MadCap.Utilities.Url.StripInvalidCharacters(href.FullPath);
                var currentHash = MadCap.Utilities.Url.CurrentHash();

                // if clicking link to currently displayed topic, reset the hash to trigger Window_Onhashchange
                if (currentHash.substring(1) == newHash)
                    document.location.hash = null;

                document.location.hash = newHash;
            }

            returnData.Handled = true;
        }
        else if (message == "navigate-home") {
            var defaultUrl = isTriPane ? new MadCap.Utilities.Url(document.location.href)
                : _HelpSystem.GetAbsoluteTopicPath("../" + _HelpSystem.DefaultStartTopic);

            MadCap.Utilities.Url.Navigate(defaultUrl.PlainPath);

            returnData.Handled = true;
        }
        else if (message == "navigate-pulse") {
            var path = dataValues[0];
            var hash = MadCap.Utilities.Url.CurrentHash();

            // append returnUrl if register/forgotpassword
            if (hash.length > 1 && path) {
                var lowerPath = path.toLowerCase();

                if (lowerPath === 'feedback/account/register' || path.toLowerCase() === 'forgotpassword') {
                    var url = new MadCap.Utilities.Url(hash.substring(1));
                    var returnUrl = url.QueryMap.GetItem('returnUrl');

                    if (returnUrl != null) {
                        returnUrl = escape(returnUrl);
                    }
                    else {
                        returnUrl = hash.substring(1);
                    }

                    path += '?returnUrl=' + returnUrl;
                }
            }

            if (path)
                NavigateStream(path);

            returnData.Handled = true;
        }
        else if (message == "navigate-previous") {
            PreviousTopic();

            returnData.Handled = true;
        }
        else if (message == "navigate-next") {
            NextTopic();

            returnData.Handled = true;
        }
        else if (message == "login-user" || message == "login-pulse") {
            if (_UserGuid == null) {
                var mode = message == "login-pulse" ? "pulse" : "new";
                _LoginDialog = new MadCap.Feedback.LoginDialog(_FeedbackController, mode);

                if (mode == "new") {
                    $(_LoginDialog).bind("closed", function () {
                        UpdateLoginButton();

                        responseData[responseData.length] = _UserGuid;

                        MadCap.Utilities.CrossFrame._PostMessageResponse(messageSource, message, responseData.length > 0 ? responseData : null, messageID);
                    });
                }

                _LoginDialog.Show();

                //

                returnData.Handled = true;
                returnData.FireResponse = false;
            }
            else {
                responseData[responseData.length] = _UserGuid;

                //

                returnData.Handled = true;
                returnData.FireResponse = true;
            }
        }
        else if (message == "get-csh-id") {
            responseData[responseData.length] = LoadVarMap().GetItem("cshid");

            //

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "get-user-guid") {
            responseData[responseData.length] = _UserGuid;

            //

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "get-topic-path-by-stream-id") {
            var streamID = dataValues[0];

            _FeedbackController.GetTopicPathByStreamID(streamID, function (topicPath) {
                responseData[responseData.length] = topicPath;

                MadCap.Utilities.CrossFrame._PostMessageResponse(messageSource, message, responseData.length > 0 ? responseData : null, messageID);
            }, null, null);

            //

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "get-topic-path-by-page-id") {
            var pageID = dataValues[0];

            _FeedbackController.GetTopicPathByPageID(pageID, function (topicPath) {
                responseData[responseData.length] = topicPath;

                MadCap.Utilities.CrossFrame._PostMessageResponse(messageSource, message, responseData.length > 0 ? responseData : null, messageID);
            }, null, null);

            //

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "hash-changed") {
            var newHash = dataValues[0];
            newHash = newHash.substring(1);

            history.pushState(null, null, document.location.pathname + document.location.hash + "$" + newHash);

            //

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "forward-ajax-open-success") {
            var data = dataValues[0];
            var status = parseInt(dataValues[1]);
            var dest = dataValues[2];

            ShowPane("pulse");

            MadCap.Utilities.CrossFrame.PostMessageRequest(GetPulseFrame(), "ajax-open-success", [data, status, dest]);

            //

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "get-pulse-hash") {
            var pulseHash = "";
            var hash = MadCap.Utilities.Url.CurrentHash();

            if (hash.indexOf('#pulse-') == 0)
                pulseHash = hash.substring('#pulse-'.length);

            responseData[responseData.length] = pulseHash;

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "login-complete" || message == "logout-complete") {
            MadCap.Utilities.CrossFrame.PostMessageRequest(GetPulseFrame(), "reload");
            MadCap.Utilities.CrossFrame.PostMessageRequest(frames["community-frame-html5"], "reload");
            MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topiccomments-html5"], "reload");
            MadCap.Utilities.CrossFrame.PostMessageRequest(frames["topic"], "reload-pulse");

            CloseLoginDialog();
            UpdateLoginButton();

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "close-login-dialog") {
            CloseLoginDialog();

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "set-pulse-login-id") {
            if (_FeedbackController != null)
                _FeedbackController.PulseUserGuid = dataValues[0];

            UpdateLoginButton();

            returnData.Handled = true;
            returnData.FireResponse = false;
        }
        else if (message == "get-parent-window-width") {
            responseData[responseData.length] = window.innerWidth;

            returnData.Handled = true;
            returnData.FireResponse = true;
        }
        else if (message == "set-topic-content") {
            // remove stylesheets
            //MadCap.Utilities.RemoveTopicStylesheets();

            // use datavalues to populate <div id="topic"/>
            LoadTopicContent(dataValues);

            returnData.Handled = true;
            returnData.FireResponse = false;
        }

        return returnData;
    }, null);

    $(Window_Onload);
    $(window).resize(OnLayout);

    if (isTriPane || !isSkinPreview)
        $(window).hashchange(Window_Onhashchange); // hashchange polyfill

    var _TocPane = null;
    var _IndexPane = null;
    var _SearchPane = null;
    var _GlossaryPane = null;
    var _BrowseSequencesPane = null;
    var _CommunityLoaded = null;
    var _HelpSystem = null;
    var _FeedbackController = null;
    var _TopicID = null;
    var _UserGuid = null;
    var _LoginDialog = null;
})();
