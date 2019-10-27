// Entry List library
//
// Common functions for managing pages consisting of lists of several entries
// that must be processed in some way.
// Some functions are specific for checking if entries belong to one or more
// lists.
// For instance: save personal notes on YouTube videos and highlight those that
// have been started but not finished, highlight Netflix movies based on IMDb
// lists, etc.
//
// https://greasyfork.org/scripts/390248-entry-list
// Copyright (C) 2019, Guido Villa
// Original idea and some of the code are taken from IMDb 'My Movies' enhancer:
// Copyright (C) 2008-2018, Ricardo Mendonça Ferreira (ric@mpcnet.com.br)
// Released under the GPL license - http://www.gnu.org/copyleft/gpl.html
//
// For information/instructions on user scripts, see:
// https://greasyfork.org/help/installing-user-scripts
//
// To use this library in a userscript you must add to script header:
  // @require https://greasyfork.org/scripts/391648-us-utils/code/US_Utils.js
  // @require https://greasyfork.org/scripts/390248-entry-list/code/Entry_List.js
  // @grant   GM_getValue
  // @grant   GM_setValue
  // @grant   GM_deleteValue
  // @grant   GM_listValues
//
// --------------------------------------------------------------------
//
// ==UserScript==
// @namespace       https://greasyfork.org/users/373199-guido-villa
// @exclude         *
//
// ==UserLibrary==
// @name            Entry_List
// @description     Common functions for working on lists of entries
// @version         1.9
// @author          guidovilla
// @date            19.10.2019
// @copyright       2019, Guido Villa (https://greasyfork.org/users/373199-guido-villa)
// @license         GPL-3.0-or-later
// @homepageURL     https://greasyfork.org/scripts/390248-entry-list
// @supportURL      https://gitlab.com/gv-browser/userscripts/issues
// @contributionURL https://tinyurl.com/gv-donate-d7
// @attribution     Ricardo Mendonça Ferreira (https://openuserjs.org/users/AltoRetrato)
// ==/UserScript==
//
// ==/UserLibrary==
//
// --------------------------------------------------------------------
//
// To-do (priority: [H]igh, [M]edium, [L]ow):
//   - [M] Make private members actually private and not only undocumented
//         (only after understanding which ones really can be private)
//   - [M] main context as default context
//   - [M] changes to a list aren't reflected in page till reload. Change?
//   - [M] Better handle case without lists (e.g. optimizations)
//   - [M] Add description of flow in usage documentation
//   - [M] List regeneration method doesn't handle case where lists are missing
//   - [M] Add explantion on how it works in general and how lists are managed
//
// Changelog:
// ----------
//                   Use US_Utils, remove title (duplicate in US_Utils).
//                   Minor name change (EntryList -> Entry_List)
// 2019.10.19  [1.9] Add inList method for checking if entry is in list
//                   Fix use of context in startup()
// 2019.10.18  [1.8] Add possibility to download a user payload with getUser
// 2019.10.10  [1.7] Add possibility of source contexts
//                   saveList public, add title, ln, deleteList, deleteAllLists
//                   Add getPageType and processPage callbacks
//                   Some refactoring and small fixes
// 2019.10.06  [1.6] Changed storage names for future needs (multiple contexts)
//                   (requires manually adjusting previous storage)
// 2019.10.05  [1.5] Automatically handle case with only one list
//                   Better handling of list of lists
//                   Add possibility to permanently skip an entry
// 2019.10.02  [1.4] Add newContext utility method
// 2019.10.01  [1.3] More generic: getUser and getIdFromEntry are now optional
//                   Correct @namespace and other headers (for public use)
// 2019.09.27  [1.2] Refactoring and name changing: TitleList -> EntryList
// 2019.09.27  [1.1] Code cleanup (string literals, reorder methods)
//                   Check for validity of the context object
//                   Add usage documentation
// 2019.09.21  [1.0] First version
// 2019.09.20  [0.1] First test version, private use only
//

/* jshint esversion: 6, supernew: true, laxbreak: true */
/* exported EL, Library_Version_ENTRY_LIST */
/* global UU: readonly */

const Library_Version_ENTRY_LIST = '1.9';

/* How to use this library

This library instantiates an EL object that must be initialized with a
"context" object that implements some variables and callback methods (see
below) specifically for the website to be processed (the target site).
Additional contexts can be passed, each related to a source of information to
be used in processing.

Call, in order:
0. EL.newContext(name) to initialize each source and target context, before
   adding methods and variables
1. EL.init(ctx), passing the target context object
   -> not needed if you don't have external sources, just call EL.startup(ctx)
2. EL.addSource(ctx) for each external source, with its specific context object
3. EL.startup(ctx), ctx is not needed if EL.init(ctx) was called.

Other methods and variables:
- addToggleEventOnClick(button, howToFindEntry[, toggleList[, toggleType]]):
  mainly used in ctx.modifyEntry(), add an event listener that implements
  a toggle action:
  - button: the DOM object to attach the event listener to
  - howToFindEntry: how to go from evt.target to the entry object. It can be:
    - a number: # of node.parentNode to hop to get from evt.target to to entry
    - a CSS selector: used with evt.target.closest to get to entry
  - toggleList: the list where the entry is toggled when the button is pressed
                (can be omitted if a default list is to be used)
  - toggleType: the processing type that is toggled by the press of the button
                (can be omitted if only one processing type is used)
                It cannot be a falsy value (because it would mean no toggle)
- markInvalid(entry):
  mark entry as invalid to skips it in subsequent passes
  This method returns false so it can be used in isValidEntry() in this way:
  return condition || EL.markInvalid(entry)
  This leaves the return value unchanged and marks the entry only if invalid
- ln(ctx, listName): return list name as passed to determineType() (see below)
- saveList(ctx, list, name): save list of entries to storage
- deleteList(ctx, name): remove a list from storage (but not from memory)
- deleteAllLists(ctx): remove all user lists from storage (not from memory)


Mandatory callback methods and variables in main context:

- name: identifier of the site (set with newContext())

- getPageEntries():
  return (usually with querySelectorAll) an array of entries to be treated
- processItem(entry, tt, processingType):
  process the entry based on the processing type or other features of the entry


Conditionally mandatory callback methods in main context:

- getUser(): retrieve and return the username used on the website
  mandatory if data are to be stored on a per-user basis
  It can return either a single string (the username), or an object with a
  'name' and a 'payload' property. Name is used as the username, payload is
  saved in <ctx>.userPayload and can be used by context-specific functions
- getIdFromEntry(entry): return a tt: { id, name } object from the entry
  mandatory if you want to save entries to lists
  NOTE: if id is not found, entry is skipped but it is not marked as invalid
  for subsequent passes (unless you use TL.markInvalid(), see above)
- unProcessItem(entry, tt, processingType):
  like processItem, but it should reverse the action
  mandatory for entries that have a toggle action added with
  EL.addToggleEventOnClick()


Optional callback methods and variables in main context:

- interval: interval (in ms) to re-scan links in the DOM
            won't re-scan if < MIN_INTERVAL (e.g. if it is set to 0)
            dafault: DEFAULT_INTERVAL

- isEntryPage():
  return false if page must not be scanned for entries
  Default is always true => all pages contain entries
- getPageType():
  return a truthy value (true, number, object) if page is significant to the
  script for some reason (e.g. it is the page where lists are reloaded),
  a falsy value otherwise. The result is stored in ctx.pageType.
  Default is always false => no special page
- processPage(pageType, isEntryPage):
  optionally do operations on page based on pageType (and isEntryPage).
  Called only if pageType is truthy, so no need to check if that is false
- isValidEntry(entry):
  return false if entry must be skipped
  NOTE: if entry is skipped, it is not however marked as invalid for subsequent
  passes (unless you use TL.markInvalid(), see above)
  Default is always true => all entries returned by getPageEntries() are valid
- modifyEntry(entry):
  optionally modify entry when scanned for the first time (e.g. add a button)
  see also EL.addToggleEventOnClick() above
- inList(tt, list):
  check if tt is in list. Default is a simple lookup by tt.id.
- determineType(lists, tt, entry):
  return the processing type for an entry, given the lists it appears in, or
  a falsy value if no processing is required
  "lists" is an object with a true property for each list the entry appears in.
  The decision can also be taken using name, id and properties of the entry.
  If there is a single processing type, the method might as well return true/false
  Default: return true if entry is in at least one list (especially useful in
  cases with only one list, so there is no need to tell different lists apart)


Callback methods and variables in contexts for external sources:

- name: see above

- getUser(): see above
- getSourceUserFromTargetUser(targetContextName, targetUser):
  return the user name on the source site corresponding to the one on target
  site. This is needed to look for the saved lists.
  Default is looking for the last saved user (single-user scenario).
  A user payload can be downloaded as in getUser() (q.v.)
- getPageType(): see above
- processPage(pageType, isEntryPage): see above
- inList(tt, list): see above

*/


var EL = new (function() {
    'use strict';
    const SEP              = '|';
    const STORAGE_SEP      = '-';
    const FAKE_USER        = '_';
    const DEFAULT_TYPE     = '_DEF_';
    const MIN_INTERVAL     = 100;
    const DEFAULT_INTERVAL = 1000;

    var self = this;

    var initialized = false;
    var failedInit  = false;
    var mainContext;          // target context object
    var isEntryPage;          // boolean
    var allContexts;          // array (cointains mainContext, too)


    /* PRIVATE members */

    // check if target context has the correct variables and methods
    // (i.e. "implements" interface of target context)
    function isValidTargetContext(ctx) {
        var valid = true;

        valid &= UU.checkProperty(ctx, 'name',           'string');
        valid &= UU.checkProperty(ctx, 'getPageEntries', 'function');
        valid &= UU.checkProperty(ctx, 'processItem',    'function');
        valid &= UU.checkProperty(ctx, 'interval',       'number',   true);
        valid &= UU.checkProperty(ctx, 'isEntryPage',    'function', true);
        valid &= UU.checkProperty(ctx, 'getPageType',    'function', true);
        valid &= UU.checkProperty(ctx, 'isValidEntry',   'function', true);
        valid &= UU.checkProperty(ctx, 'modifyEntry',    'function', true);
        valid &= UU.checkProperty(ctx, 'determineType',  'function', true);
        valid &= UU.checkProperty(ctx, 'getUser',        'function', true);
        valid &= UU.checkProperty(ctx, 'getIdFromEntry', 'function', true);
        valid &= UU.checkProperty(ctx, 'unProcessItem',  'function', true);

        return !!valid;
    }


    // check if source context has the correct variables and methods
    // (i.e. "implements" interface of source context)
    function isValidSourceContext(ctx) {
        var valid = true;

        valid &= UU.checkProperty(ctx, 'name',                        'string');
        valid &= UU.checkProperty(ctx, 'getUser',                     'function', true);
        valid &= UU.checkProperty(ctx, 'getSourceUserFromTargetUser', 'function', true);
        valid &= UU.checkProperty(ctx, 'getPageType',                 'function', true);

        return !!valid;
    }


    // standardized names for storage variables
    var storName = {
        'listIdent':       function(ctx)           { return STORAGE_SEP + ctx.name + STORAGE_SEP + ctx.user; },
        'listPrefix':      function(ctx)           { return 'List'  + this.listIdent(ctx) + STORAGE_SEP; },

        'lastUser':        function(ctx)           { return ctx.name + STORAGE_SEP + 'lastUser'; },
        'lastUserPayload': function(ctx)           { return ctx.name + STORAGE_SEP + 'lastUserPayload'; },
        'listOfLists':     function(ctx)           { return 'Lists' + this.listIdent(ctx); },
        'listName':        function(ctx, listName) { return this.listPrefix(ctx) + listName; },
    };


    // Get and save user currently logged on <ctx> site, return true if found
    // Get last saved user and log error if no user is found
    // Along with the username, a payload may be retrieved and saved in <ctx>
    this.getLoggedUser = function(ctx) {
        if (!ctx.getUser) return !!(ctx.user = FAKE_USER);

        var user = ctx.getUser();
        var payload;
        if (user && typeof user === 'object') {
            payload = user.payload;
            user    = user.name;
        }
        if (!user) {
            UU.lw(ctx.name + ": user not logged in (or couldn't get user info) on URL", document.URL);
            user    = GM_getValue(storName.lastUser(ctx));
            payload = GM_getValue(storName.lastUserPayload(ctx));
            if (payload) payload = JSON.parse(payload);
            UU.li('Using last user:', user);
        } else {
            GM_setValue(storName.lastUser(ctx), user);
            if (payload) {
                GM_setValue(storName.lastUserPayload(ctx), JSON.stringify(payload));
            } else {
                GM_deleteValue(storName.lastUserPayload(ctx));
            }
        }
        ctx.user        = user;
        ctx.userPayload = payload;
        return !!user;
    };


    // Get and save user to read for this source <ctx>, corresponding to the
    // user on the target context. Return true if found.
    // If no mapping function is defined, take the last saved user regardless
    // of target user
    // Along with the username, a payload may be retrieved and saved in <ctx>
    this.getRemoteUser = function(ctx) {
        if (ctx.getSourceUserFromTargetUser) {
            ctx.user = ctx.getSourceUserFromTargetUser(mainContext.name, mainContext.user);
            if (ctx.user && typeof ctx.user === 'object') {
                ctx.payload = ctx.user.payload;
                ctx.user    = ctx.user.name;
            }
            if (!ctx.user) {
                UU.le(ctx.name + ": cannot find user corresponding to '" + mainContext.user + "' on " + mainContext.name);
                delete ctx.payload;
            }
        } else {
            ctx.user        = GM_getValue(storName.lastUser(ctx));
            ctx.userPayload = GM_getValue(storName.lastUserPayload(ctx));
            if (ctx.userPayload) ctx.userPayload = JSON.parse(ctx.userPayload);
        }
        return !!(ctx.user);
    };


    // Regenerate and save the list of lists stored object, even if empty
    // returns the new list
    function regenerateListOfLists(ctx) {
        var allVariables = GM_listValues();

        var listNames = allVariables.reduce(function(listNames, variable) {
            if (variable.startsWith(storName.listPrefix(ctx))) {
                listNames.push(variable.substring(storName.listPrefix(ctx).length));
            }
            return listNames;
        }, []);

        var jsonData = JSON.stringify(listNames);
        GM_setValue(storName.listOfLists(ctx), jsonData);
        return listNames;
    }


    // Load a single saved lists
    function loadSavedList(listName) {
        var list;
        var jsonData = GM_getValue(listName);
        if (jsonData) {
            try {
                list = JSON.parse(jsonData);
            } catch(err) {
                UU.le("Error loading saved list named '" + listName + "'\n", err);
            }
        }
        return list;
    }


    // Load the list of lists, regenerating it if necessary
    // always returns an array, possibly empty
    function loadListOfLists(ctx) {
        var listNames = loadSavedList(storName.listOfLists(ctx));

        if (!Array.isArray(listNames)) listNames = regenerateListOfLists(ctx);
        return listNames;
    }


    // Load lists for the current user
    this.loadSavedLists = function(ctx) {
        var listNames = loadListOfLists(ctx);
        var lists = {};
        var list;
        var mustRegenerateListOfLists = false;

        listNames.forEach(function(listName) {
            list = loadSavedList(storName.listName(ctx, listName));
            if (list) lists[listName] = list;
            else mustRegenerateListOfLists = true;
        });
        if (mustRegenerateListOfLists) regenerateListOfLists(ctx);
        return lists;
    };


    // Receives an entry tt and finds all lists where tt.id appears
    this.inLists = function(tt) {
        var lists = {};

        allContexts.forEach(function(ctx) {
            for (var list in ctx.allLists) {
                if (ctx.inList(tt, ctx.allLists[list])) lists[self.ln(ctx, list)] = true;
            }
        });

        return lists;
    };
    function _inList_default(tt, list) {
        return !!list[tt.id];
    }


    // Wrap ctx.getIdFromEntry and add error logging
    function _wrap_getIdFromEntry(ctx, entry) {
        var tt = ctx.getIdFromEntry(entry);
        if (!tt) UU.le('Could not determine id - for entry', entry);
        return tt;
    }


    // Process a single entry
    function processOneEntry(entry, ctx = mainContext) {
        var tt, lists, processingType;

        // if entry has already been previously processed, skip it
        if (entry.ELProcessed || entry.ELInvalid) return;

        // see if entry is valid
        if (ctx.isValidEntry && !ctx.isValidEntry(entry)) return;

        if (ctx.getIdFromEntry) {
            tt = _wrap_getIdFromEntry(ctx, entry);
            if (!tt) return;
        }

        if (ctx.modifyEntry) ctx.modifyEntry(entry);
        lists = ( tt ? self.inLists(tt) : {} );

        processingType = (ctx.determineType
            ? ctx.determineType(lists, tt, entry)
            : Object.keys(lists).length > 0);

        if (processingType) {
            ctx.processItem(entry, tt, processingType);
            entry.ELProcessingType = processingType;
        }

        entry.ELProcessed = true; // set to "true" after processing (so we skip it on next pass)
    }


    // Process all entries in current page
    this.processAllEntries = function(ctx = mainContext) {
        var entries = ctx.getPageEntries();
        if (!entries) return;

        for (var i = 0; i < entries.length; i++) {
            processOneEntry(entries[i], ctx);
        }
    };


    // handle the toggle event
    this.handleToggleButton = function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        var data = evt.target.dataset;
        var toggleList = (UU.isUndef(data.toggleList) ? DEFAULT_TYPE : data.toggleList);
        var toggleType = (UU.isUndef(data.toggleType) ? DEFAULT_TYPE : data.toggleType);

        // get corresponding entry
        var entry = evt.target;
        if (Number.isInteger(Number(data.howToFindEntry))) {
            for (var i = 0; i < Number(data.howToFindEntry); i++) entry = entry.parentNode;
        } else {
            entry = entry.closest(data.howToFindEntry);
        }

        self.toggleEntry(entry, toggleList, toggleType);
    };


    // add/remove entry from a list
    this.toggleEntry = function(entry, toggleList, toggleType) {
        var ctx = mainContext;

        var tt = _wrap_getIdFromEntry(ctx, entry);
        if (!tt) return;

        // check if item is in list
        var list = ctx.allLists[toggleList];
        if (!list) list = ctx.allLists[toggleList] = {};
        if (list[tt.id]) {
            delete list[tt.id];
            ctx.unProcessItem(entry, tt, toggleType);
            entry.ELProcessingType = '-' + toggleType;
        } else {
            list[tt.id] = tt.name;
            ctx.processItem(entry, tt, toggleType);
            entry.ELProcessingType = toggleType;
        }
        self.saveList(ctx, list, toggleList);
    };



    /* PUBLIC members */

    // utility method that creates a new context, initialized with <name>
    this.newContext = function(name) {
        return { 'name': name };
    };


    // init method
    this.init = function(ctx) {
        initialized = false;
        failedInit  = true;
        mainContext = null;
        isEntryPage = false;
        allContexts = [];

        // check that passed context is good
        if (!isValidTargetContext(ctx)) {
            UU.le('Invalid target context, aborting');
            return;
        }

        isEntryPage  = ( !ctx.isEntryPage || ctx.isEntryPage() );
        ctx.pageType = (  ctx.getPageType && ctx.getPageType() );

        if (isEntryPage || ctx.pageType) {
            // find current logged in user, or quit script
            if (!self.getLoggedUser(ctx)) {
                UU.le(ctx.name + ': no user is defined, aborting');
                return;
            }
            if (ctx.pageType && ctx.processPage) ctx.processPage(ctx.pageType, isEntryPage);
        }

        mainContext = ctx;
        initialized = true;
        failedInit  = false;
    };


    // startup method. Don't pass "ctx" arg if init() had been called before
    this.startup = function(ctx) {
        if (!initialized) {
            if (failedInit) return;
            self.init(ctx);

        } else if (ctx) UU.lw('Startup called after init, ignoring context argument');

        if (!isEntryPage) return;

        // Load list data for this user from local storage
        mainContext.allLists = self.loadSavedLists(mainContext);
        allContexts.push(mainContext);
        // Setup the default list checking method, if not provided by context
        if (!mainContext.inList) mainContext.inList = _inList_default;

        // start the entry processing method
        self.processAllEntries();
        if (UU.isUndef(mainContext.interval) || mainContext.interval >= MIN_INTERVAL) {
            // TODO we might consider using MutationObserver in the future, instead
            mainContext.timer = setInterval(self.processAllEntries, ( mainContext.interval || DEFAULT_INTERVAL ));
        }
    };


    // add a source context
    this.addSource = function(ctx) {
        if (!initialized) {
            UU.le('Main context is not initialized, aborting addSource');
            return;
        }

        // check that passed context is good
        if (!isValidSourceContext(ctx)) {
            UU.le('Invalid source context, aborting');
            return;
        }

        ctx.pageType = ( ctx.getPageType && ctx.getPageType() );

        if (ctx.pageType) {
            // find current logged in user, or quit script
            if (!self.getLoggedUser(ctx)) {
                UU.le(ctx.name + ': no user is defined, aborting');
                return;
            }
            if (ctx.processPage) ctx.processPage(ctx.pageType, isEntryPage);
        }

        if (!isEntryPage) return;

        // find user corresponding to current logged in user, or quit script
        // TODO if (entryPage && pageType), remote user overwrites logged user
        if (!self.getRemoteUser(ctx)) {
            UU.le(ctx.name + ': no remote user is defined, aborting');
            return;
        }

        // Load list data for this user from local storage
        ctx.allLists = self.loadSavedLists(ctx);
        allContexts.push(ctx);
        // Setup the default list checking method, if not provided by context
        if (!ctx.inList) ctx.inList = _inList_default;
    };


    this.addToggleEventOnClick = function(button, howToFindEntry, toggleList = null, toggleType = null) {
        button.dataset.howToFindEntry = howToFindEntry;
        if (toggleList !== null) button.dataset.toggleList = toggleList;
        if (toggleType !== null) button.dataset.toggleType = toggleType;
        button.addEventListener('click', self.handleToggleButton, false);
    };


    this.markInvalid = function(entry) {
        entry.ELInvalid = true;
        return false;
    };


    // return the list name as generated by inLists (to be used in ctx.determineType())
    this.ln = function(ctx, listName) {
        return ctx.name + SEP + listName;
    };


    // Save single list for the current user
    this.saveList = function(ctx, list, name) {
        var jsonData;
        var listNames = loadListOfLists(ctx);

        if (listNames.indexOf(name) == -1) {
            listNames.push(name);
            jsonData = JSON.stringify(listNames);
            GM_setValue(storName.listOfLists(ctx), jsonData);
        }

        jsonData = JSON.stringify(list);
        GM_setValue(storName.listName(ctx, name), jsonData);
    };


    // Delete a single list for the current user
    this.deleteList = function(ctx, name) {
        var jsonData;
        var listNames = loadListOfLists(ctx);

        var i = listNames.indexOf(name);
        if (i != -1) {
            listNames.splice(i, 1);
            jsonData = JSON.stringify(listNames);
            GM_setValue(storName.listOfLists(ctx), jsonData);
        }

        GM_deleteValue(storName.listName(ctx, name));
    };


    // Delete all lists for the current user
    this.deleteAllLists = function(ctx) {
        var listNames = loadListOfLists(ctx);
        GM_deleteValue(storName.listOfLists(ctx));

        listNames.forEach(function(listName) {
            GM_deleteValue(storName.listName(ctx, listName));
        });
    };


})();
