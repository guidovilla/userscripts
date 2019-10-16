// ProgressBar library
//
// Create and manage simple progress bars.
//
// https://greasyfork.org/scripts/391236-progressbar
// Copyright (C) 2019, Guido Villa
// Original version of the script is taken from IMDb 'My Movies' enhancer:
// Copyright (C) 2008-2018, Ricardo Mendonça Ferreira (ric@mpcnet.com.br)
// Released under the GPL license - http://www.gnu.org/copyleft/gpl.html
//
// For instructions on user scripts, see:
// https://greasyfork.org/help/installing-user-scripts
//
// To use this library in a userscript you must add to script header:
  // @require  https://greasyfork.org/scripts/391236-progressbar/code/ProgressBar.js
  // @grant    GM_addStyle
//
// --------------------------------------------------------------------
//
// ==UserScript==
// @namespace       https://greasyfork.org/users/373199-guido-villa
// @exclude         *
//
// ==UserLibrary==
// @name            ProgressBar
// @description     Create and manage simple progress bars
// @version         1.0
// @author          guidovilla
// @date            16.10.2019
// @copyright       2019, Guido Villa (https://greasyfork.org/users/373199-guido-villa)
// @license         GPL-3.0-or-later
// @homepageURL     https://greasyfork.org/scripts/391236-progressbar
// @supportURL      https://gitlab.com/gv-browser/userscripts/issues
// @contributionURL https://tinyurl.com/gv-donate-2e
// ==/UserScript==
//
// ==/UserLibrary==
//
// --------------------------------------------------------------------
//
// To-do (priority: [H]igh, [M]edium, [L]ow):
//   - [M] width must be an integer multiple of background-size, otherwise animation will skip => address
//   - [M] speed of the animation depends on width => fix?
//   - [m] speed of transition is not constant (time is constant, regardless of the "space" to be travelled) => can it be fixed?
//   - [H] wrap in order to hide global variables
//   - [M] nicer presentation style (maybe small vertical bars), graphical improvements
//
// Changelog:
// ----------
// 2019.10.16  [1.0] First version
// 2019.10.14  [0.1] First test version, private use only
//

/* jshint esversion: 6, supernew: true, laxbreak: true */
/* exported EL, Library_Version_PROGRESSBAR */

const Library_Version_PROGRESSBAR = '1.0';

/* How to use the library

- Create a new progress bar:
  var pb = new ProgressBar(...)

- Change the progress:
  pb.update(...)
  pb.advance(...)

- Remove the progress bar:
  pb.close()

Details
Progress bars are defined by three main parameters:
- finish:   value that defines what is 100%
            this is set at creation time and cannot be changed
- progress: value that defines current completion status (must be <= finish)
            initial progress is set a creation time, then it can be updated
            with update() and advance()
            When progress = -1, the bar is in "generic" loading mode, i.e. it
            does not show a specific progress but an unspecified loading status
- message:  the message printed inside the bar (e.g. "Loading...")
            initial message is set a creation time, then it can be changed
            with every update() and advance().
            The message can contain a few placeholders that are replaced with
            actual progress data:
            - {#}: replace with current progress number
            - {$}: replace with finish value
            - {%}: replace with completion percentage (= 100*progress/finish)
            E.g.: "Loading {#} of {$}..."  =>  "Loading 7 of 23..."

All numbers are integers.

Information for changing styles:
The HTML id of the container DIV can be accessed through the 'id' property
of the progress bar object.
All elements that constitute the bar have a generic "pb-progress-bar" class and
a specific "pb-progress-bar-XXX" class different for each element.
Generic loading is enabled by applying a "pb-generic" class to the
container DIV.

Parameters (all parameters are optional):

- ProgressBar(finish, msg, options)
  Create a new progress bar. Parameters:
  - finish: maximum value that can be reached (default is 100)
  - msg: message written in the bar, see above for substitutions
         default is "Loading {#}/{$}..."
  - options: an object that may contain:
    - start: initial progress status (default is 0, i.e. the beginning)
    - container: positioned element where the bar will be centered
                 null (the default): center bar on the screen
    - width: width in pixels of the progress bar (default is 226.3)
    - height: height in pixels of the progress bar (default is 30)

- update(progress, msg)
  Update the progress bar status. Parameters:
  - progress: the new progress value (default is 0)
  - msg: an optional new message (default is: don't change message)

- advance(value, msg)
  Increment the progress bar status. Parameters:
  - value: the increment value, can be negative (default is 1)
  - msg: an optional new message (default is: don't change message)

- close()
  Close the progress bar and remove it from the DOM.

*/


    var progress_bar_style_has_been_loaded = false;
    var progress_bar_index = 0;
    // Create progress bar
    // eslint-disable-next-line max-statements
    function ProgressBar(finish = 100, msg = 'Loading {#}/{$}...', options) {
        // style definition
        var STYLE = '.pb-progress-bar.pb-progress-bar-box{border:2px solid black;background-color:white;padding:4px;outline:white solid 6px;}'
                  + '.pb-progress-bar.pb-progress-bar-bar{background-color:green;height:100%;transition:width 300ms linear;}'
                  + '.pb-progress-bar.pb-progress-bar-txtcont{position:absolute;top:0;left:0;width:100%;height:100%;display:table;}'
                  + '.pb-progress-bar.pb-progress-bar-txt{display:table-cell;text-align:center;vertical-align:middle;font:16px verdana,sans-serif;color:black;}'
                  + '.pb-progress-bar.pb-progress-bar-box.pb-generic{background:repeating-linear-gradient(-45deg,#F0F0F0 0 20px,#ccc 20px 40px);background-size:56.56854px;animation:2s linear infinite loading;}'
                  + '.pb-progress-bar.pb-progress-bar-box.pb-generic .pb-progress-bar-bar{background-color:transparent;transition:none}'
                  + '@keyframes loading{from{background-position-x:0%;} to{background-position-x:100%;}}';
        if (!progress_bar_style_has_been_loaded) {
            GM_addStyle(STYLE);
            progress_bar_style_has_been_loaded = true;
        }

        var self = this;

        // basic configuration
        this.id       = 'pb-progress-bar-' + ++progress_bar_index; // 'id' is public
        var start     = 0;
        var container = null;
        var width     = 226.27417;
        var height    = 30;
        var message   = msg;

        var current;  // completion status of the progress bar

        var pbBox, pb, pbTxtCont, pbTxt;  // elements of the progress bar

        // helper function to create the elements
        function createElement(father, elementType, className, id) {
            var elem = document.createElement(elementType);
            if (typeof id !== 'undefined') elem.id = id;
            elem.className = 'pb-progress-bar ' + className;
            father.appendChild(elem);
            return elem;
        }

        // initialization function
        function init() {
            // check for options in the call
            if (options && typeof options === 'object') {
                if (typeof options.id        !== 'undefined') self.id   = options.id;
                if (typeof options.start     !== 'undefined') start     = options.start;
                if (typeof options.container !== 'undefined') container = options.container;
                if (typeof options.width     !== 'undefined') width     = options.width;
                if (typeof options.height    !== 'undefined') height    = options.height;
            }

            // calculate positioning
            var containerWidth, containerHeight,
                cntElem,
                positioningStyle;

            function setPositioningVars(cnt, pos, w, h) {
                containerWidth  = w;
                containerHeight = h;
                cntElem = cnt;
                positioningStyle = pos;
            }

            if (container) {
                var rect = container.getBoundingClientRect();
                setPositioningVars(container, 'absolute', rect.width, rect.height);
            } else {
                setPositioningVars(document.body, 'fixed', window.innerWidth, window.innerHeight);
            }
            var top  = containerHeight / 2 - height / 2;
            var left = containerWidth  / 2 - width  / 2;

            // create the elements
            pbBox = createElement(cntElem, 'div', 'pb-progress-bar-box', self.id);
            pbBox.style.cssText = 'position:' + positioningStyle
                                + '; height:' + height + 'px;width:' + width
                                + 'px;top:'   + top    + 'px;left:'  + left + 'px;';

            pb        = createElement(pbBox,     'div', 'pb-progress-bar-bar');
            pbTxtCont = createElement(pbBox,     'div', 'pb-progress-bar-txtcont');
            pbTxt     = createElement(pbTxtCont, 'div', 'pb-progress-bar-txt');

            // set the initial progress
            self.update(start);
        }


        /* PUBLIC members */

        // update the progress to "currentVal" and optionally change the message
        this.update = function(currentVal = 0, newMsg) {
            if (newMsg) message = newMsg;
            var newVal = (currentVal > finish ? finish : currentVal);

            if (newVal < 0) {
                // setting the width to zero is not really needed, but ensures a
                // more consistent behaviour in cases where the delay (see
                // below) is not enough.
                pb.style.width = '0';
                // try to make the message more appealing in "generic" case
                pbTxt.textContent = message
                                    .replace(/ *{#}.*{\$} */g, '')
                                    .replace(/ *{#} */g,       '')
                                    .replace(/ *{\$} */g,      '')
                                    .replace(/ *{%} *%? */g,   '');
                pbBox.classList.add('pb-generic');
            } else {
                pb.style.width = (100*newVal/finish) + '%';
                if (current < 0) {
                    // if exiting from "generic" mode a small delay is needed,
                    // otherwise the class may be removed when changing the
                    // width, and the width transition takes place anyway
                    setTimeout(function() {
                        pbBox.classList.remove('pb-generic');
                    }, 33);
                } else {
                    pbBox.classList.remove('pb-generic');
                }
                // replace placeholders with actual numbers
                pbTxt.textContent = message
                                    .replace(/{#}/g, newVal)
                                    .replace(/{\$}/g, finish)
                                    .replace(/{%}/g, Math.round(100*newVal/finish));
            }
            current = newVal;
        };


        // advance the progress by "value" and optionally change the message
        this.advance = function(value = 1, newMsg) {
            self.update(current + value, newMsg);
        };


        // close/remove the progress bar
        this.close = function() {
            pbBox.parentNode.removeChild(pbBox);
        };


        /* INITIALIZATION */
        init();
    }
