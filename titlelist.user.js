//{
// Common functions for working on lists of titles, loading them, highlighting
// titles based on these lists.
//
// Copyright (c) 2019, Guido Villa
// Original idea and some of the code is taken from IMDb 'My Movies' enhancer:
// Copyright (c) 2008-2018, Ricardo Mendonça Ferreira (ric@mpcnet.com.br)
// Released under the GPL license - http://www.gnu.org/copyleft/gpl.html
//
// --------------------------------------------------------------------
//
// ==UserScript==
// @name          TitleList
// @description   Common functions for working on lists of titles
// @namespace     https://greasyfork.org/en/scripts/390248-titlelist
// @updateURL     about:blank
// @homepageURL   https://greasyfork.org/en/scripts/390248-titlelist
// @copyright     2019, Guido Villa
// @license       GPL-3.0-or-later
// @oujs:author   Guido
// @date          27.09.2019
// @version       1.1
// ==/UserScript==
//
// To-do (priority: [H]igh, [M]edium, [L]ow):
//   - [M] Reorder functions
//   - [H] Extend library to work on all the scripts
//   - [M] correct public/private
//   - [M] main context as default context
//   - [M] move scripts to github or similar
//   - [M] do we need that the library is not cached? if so, how?
//   - [M] See if ok that old versions are public
//   - [M] changes to a list aren't reflected in page till reload. Change?
//   - [M] Automatically handle case with only one list
//   - [M] Add indication of URL to use to @require library itself
//   - [M] correct @namespace and @homepageURL
//   - [M] Auto-update
//   - [L] Make public
//
// History:
// --------
// 2019.09.27  [1.1] Code cleanup (string and number literals)
// 2019.09.21  [1.0] First version
// 2019.09.18  [0.1] First test version, private use only
//
//}

/* jshint esversion: 6, supernew: true */
/* exported TL, Library_Version_TITLELIST */

const Library_Version_TITLELIST = '1.1';

// FUNCTIONS ************************************************************************************************************

var TL = new (function() {
    'use strict';
    const STORAGE_SEP      = '-';
    const MIN_INTERVAL     = 100;
    const DEFAULT_INTERVAL = 1000;

    var self = this;

    this.mainContext = null;


    // Return name of user currently logged on <ctx> site
    // Return last saved value and log error if no user is found
    this.getLoggedUser = function(ctx) {
        var user = ctx.getUser(document);

        if (!user) {
            console.error(ctx.name + ": user not logged in (or couldn't get user info) on URL " + document.URL);
            user = GM_getValue(storName.lastUser(ctx), '');
            console.error("Using last user: " + user);
        }
        GM_setValue(storName.lastUser(ctx), user);
        ctx.user = user;
        return user;
    };


    /* PRIVATE members */
    // Load a single saved lists
    function loadSavedList(listName) {
        var list;
        var userData = GM_getValue(listName, null);
        if (userData) {
            try {
                list = JSON.parse(userData);
            } catch(err) {
                alert("Error loading saved list named '" + listName + "'!\n" + err.message);
            }
        }
        return list;
    }

    var storName = {
        lastUser:    function(ctx)       { return ctx.name + STORAGE_SEP + 'lastUser'; },
        listOfLists: function(ctx)       { return'TitleLists' + STORAGE_SEP + ctx.user; },
        listName:    function(ctx, list) { return'TitleList' + STORAGE_SEP + ctx.user + STORAGE_SEP + listName; },
    };


    // Load lists saved for the current user
    this.loadSavedLists = function(ctx) {
        var lists = {};

        var listNames = loadSavedList(storName.listOfLists(ctx));
        if (!listNames) return lists;

        for (var listName in listNames) {
            lists[listName] = loadSavedList(storName.listName(ctx, listName));
        }
        return lists;
    };


    // Save single list for the current user
    this.saveList = function(ctx, list, name) {
        var listNames = ( loadSavedList(storName.listOfLists(ctx)) || {} );

        listNames[name] = 1;
        var userData = JSON.stringify(listNames);
        GM_setValue(storName.listOfLists(ctx), userData);

        userData = JSON.stringify(list);
        GM_setValue(storName.listName(ctx, name), userData);
    };


    // startup function
    this.startup = function(ctx) {
        self.mainContext = ctx;

        //TODO forse salvare una variabile we_are_in_a_title_page nel contesto?
        //TODO per altri casi lo startup deve fare anche altro
        if (!( !ctx.isTitlePage || ctx.isTitlePage(document) )) return;

        // find current logged in user, or quit script
        if (!self.getLoggedUser(ctx)) {
            console.log('No user is defined, aborting');
            return;
        }

        // Load list data for this user from local storage
        ctx.allLists = self.loadSavedLists(ctx);

        // start the title processing function
        self.processTitles(ctx);
        if (typeof ctx.interval === "undefined" || ctx.interval >= MIN_INTERVAL) {
            // TODO we might consider using MutationObserver in the future, instead
            ctx.timer = setInterval(function() {self.processTitles(ctx);}, ctx.interval || DEFAULT_INTERVAL);
        }
    };


    // Receives a title (and corresponding entry) and finds all lists title is in
    this.inLists = function(ctx, tt) {
        var lists = {};

        for (var list in ctx.allLists) {
            if (ctx.allLists[list][tt.id]) lists[list] = true;
        }

        return lists;
    };


    // Process all title cards in current page
    this.processTitles = function(ctx) {
        var entries = ctx.getTitleEntries(document);
        if (!entries) return;

        var entry, tt, lists, processingType;
        for (var i = 0; i < entries.length; i++) {
            entry = entries[i];

            // if entry has already been previously processed, skip it
            if (entry.TLProcessed) continue;

            // see if entry is valid
            if (ctx.isValidEntry && !ctx.isValidEntry(entry)) continue;

            tt = ctx.getIdFromEntry(entry);
            if (!tt) continue;

            if (ctx.modifyEntry) ctx.modifyEntry(entry);
            lists = self.inLists(ctx, tt);

            processingType = ctx.determineType(lists, tt, entry);

            if (processingType) {
                ctx.processItem(entry, tt, processingType);
                entry.TLProcessingType = processingType;
            }

            entry.TLProcessed = true; // set to "true" after processing (so we skip it on next pass)
        }
    };


    this.toggleTitle = function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        var data = evt.target.dataset;
        var ctx = self.mainContext;

        // get title entry
        var entry = evt.target;
        if (Number.isInteger(Number(data.howToFindEntry))) {
            for (var i = 0; i < Number(data.howToFindEntry); i++) entry = entry.parentNode;
        } else {
            entry = entry.closest(data.howToFindEntry);
        }

        var tt = ctx.getIdFromEntry(entry);
        if (!tt) return;

        // check if item is in list
        var list = ctx.allLists[data.toggleList];
        if (!list) list = ctx.allLists[data.toggleList] = {};
        if (list[tt.id]) {
            delete list[tt.id];
            ctx.unProcessItem(entry, tt, data.toggleType);
            entry.TLProcessingType = "-" + data.toggleType;
        } else {
            list[tt.id] = tt.title;
            ctx.processItem(entry, tt, data.toggleType);
            entry.TLProcessingType = data.toggleType;
        }
        self.saveList(ctx, list, data.toggleList);
    };



    this.addToggleEventOnClick = function(button, toggleType, toggleList, howToFindEntry) {
        button.dataset.toggleType     = toggleType;
        button.dataset.toggleList     = toggleList;
        button.dataset.howToFindEntry = howToFindEntry;
        button.addEventListener('click', self.toggleTitle, false);
    };


})();