import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';

import {
    Extension,
    gettext as _
} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
    InjectionManager
} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    VerticalAppDisplay
} from './appDisplay.js';

export default class VerticalAppGridExtension extends Extension {
    enable() {
        const extension = this;
        const overviewControlsProto = OverviewControls.ControlsManager.prototype;

        this._settings = this.getSettings();
        this._vertAppDisplay = new VerticalAppDisplay(this._settings);
        this._injectionManager = new InjectionManager();
        this._overviewShowingId = null;
        this._overviewReadyPollId = null;

        this._getOverviewControls = () => Main.overview && Main.overview._overview ? Main.overview._overview._controls : null;

        this._onOverviewReady = () => {
            const attached = this._attachOverviewControls();
            this._setAppDisplayLayout();
            if (this._installAppDisplayBoxOverride) {
                this._installAppDisplayBoxOverride();
            }
            this._updateWorkspacesVisibility();
            return attached;
        };

        this._attachOverviewControls = () => {
            const controls = this._getOverviewControls();
            if (!controls || !this._vertAppDisplay) {
                return false;
            }

            if (this._vertAppDisplay.get_parent() !== controls) {
                controls.add_child(this._vertAppDisplay);
            }

            this._overviewControls = controls;
            this._overviewLayoutManager = controls.layout_manager;

            return true;
        };

        this._setAppDisplayLayout = () => {
            if (!this._overviewLayoutManager || !this._vertAppDisplay) {
                return;
            }

            this._overviewLayoutManager._appDisplay = this._vertAppDisplay;
        };

        this._startOverviewReadyPoll = () => {
            if (this._overviewReadyPollId !== null) {
                return;
            }

            this._overviewReadyPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (this._onOverviewReady()) {
                    this._overviewReadyPollId = null;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        };

        this._stopOverviewReadyPoll = () => {
            if (this._overviewReadyPollId !== null) {
                GLib.source_remove(this._overviewReadyPollId);
                this._overviewReadyPollId = null;
            }
        };

        this._ensureOverviewConnections = () => {
            if (!Main.overview || this._overviewShowingId !== null) {
                return;
            }

            if (Main.overview.connect) {
                this._overviewShowingId = Main.overview.connect('showing', () => {
                    this._onOverviewReady();
                });
            }
        };

        // Apply workspace visibility preference.
        this._updateWorkspacesVisibility = () => {
            try {
                const show = this._settings.get_boolean('show-workspaces');
                const controls = this._overviewControls || this._getOverviewControls();

                if (!controls) {
                    this._ensureOverviewConnections();
                    return;
                }

                this._overviewControls = controls;
                const workspaceDisplay = controls._workspacesDisplay;

                if (!workspaceDisplay) {
                    // Controls exist but haven't finished constructing yet; retry.
                    this._ensureOverviewConnections();
                    return;
                }

                let hidden = false;

                try {
                    if (show) {
                        workspaceDisplay.show();
                        workspaceDisplay.visible = true;
                        workspaceDisplay.reactive = true;
                        workspaceDisplay.sensitive = true;
                        workspaceDisplay.opacity = 255;
                        if (workspaceDisplay._swipeTracker) {
                            workspaceDisplay._swipeTracker.enabled = true;
                        }
                    } else {
                        workspaceDisplay.hide();
                        workspaceDisplay.visible = false;
                        workspaceDisplay.reactive = false;
                        workspaceDisplay.sensitive = false;
                        workspaceDisplay.opacity = 0;
                        if (workspaceDisplay._swipeTracker) {
                            workspaceDisplay._swipeTracker.enabled = false;
                        }
                    }
                    hidden = true;
                } catch (e) {
                    log(`vertigrid: Error toggling workspacesDisplay: ${e}`);
                }

                // Force layout updates
                if (hidden) {
                    try {
                        if (controls.layout_manager) {
                            controls.layout_manager.layout_changed();
                        }
                        controls.queue_relayout();
                        const parent = controls.get_parent();
                        if (parent && parent.layout_manager) {
                            parent.layout_manager.layout_changed();
                        }
                        if (parent) {
                            parent.queue_relayout();
                        }
                    } catch (e) {
                        log(`vertigrid: Error in layout update: ${e}`);
                    }
                }
            } catch (e) {
                log(`vertigrid: Failed to update workspace visibility: ${e}`);
            }
        };

        const ViewPage = {
            WINDOWS: 0,
            APPS: 1,
            SEARCH: 2
        };

        this._ensureOverviewConnections();
        this._attachOverviewControls();
        this._setAppDisplayLayout();
        this._onOverviewReady();
        this._startOverviewReadyPoll();

        // Reclaim the space GNOME reserves for the "workspace preview"
        this._installAppDisplayBoxOverride = () => {
            const controls = this._overviewControls || this._getOverviewControls();
            if (!controls || !controls.layout_manager || this._appDisplayBoxOverrideInstalled) {
                return false;
            }

            const layoutManagerProto = Object.getPrototypeOf(controls.layout_manager);
            this._appDisplayBoxOverrideInstalled = true;

            this._injectionManager.overrideMethod(layoutManagerProto, '_getAppDisplayBoxForState', originalFn => function(state, box, searchHeight, dashHeight, workspacesBox, spacing) {
                if (extension._settings.get_boolean('show-workspaces')) {
                    return originalFn.call(this, state, box, searchHeight, dashHeight, workspacesBox, spacing);
                }

                // Same shape as the stock method, but treat the reserved
                // workspace-preview height as 0 so the app grid gets that
                // space back.
                const [width, height] = box.get_size();
                const {
                    y1: startY
                } = this._workAreaBox;
                const appDisplayBox = new Clutter.ActorBox();

                switch (state) {
                    case OverviewControls.ControlsState.HIDDEN:
                    case OverviewControls.ControlsState.WINDOW_PICKER:
                        appDisplayBox.set_origin(0, box.y2);
                        break;
                    case OverviewControls.ControlsState.APP_GRID:
                        appDisplayBox.set_origin(0, startY + searchHeight + spacing);
                        break;
                }

                appDisplayBox.set_size(width,
                    height - searchHeight - spacing - dashHeight - spacing);

                return appDisplayBox;
            });

            return true;
        };

        this._installAppDisplayBoxOverride();

        this._injectionManager.overrideMethod(overviewControlsProto, '_setVisibility', originalFn => function() {
            if (!extension._settings.get_boolean('show-workspaces')) {
                const activePage = this._searchController.searchActive ? ViewPage.SEARCH :
                    (this._appDisplay.visible ? ViewPage.APPS : ViewPage.WINDOWS);
                const dashVisible = activePage == ViewPage.WINDOWS || activePage == ViewPage.APPS;
                const thumbnailsVisible = false;

                if (dashVisible) {
                    this._dashSlider.slideIn();
                } else {
                    this._dashSlider.slideOut();
                }

                if (thumbnailsVisible) {
                    this._thumbnailsSlider.slideIn();
                } else {
                    this._thumbnailsSlider.slideOut();
                }

                if (this._dashSpacer) {
                    this._dashSpacer.visible = activePage == ViewPage.WINDOWS;
                }

                return;
            }

            originalFn.call(this);
        });

        // Add the vertical app display to the overview when controls are ready
        this._attachOverviewControls();
        this._ensureOverviewConnections();

        // Steal the layout of the original app display
        this._overviewLayoutManager._appDisplay = this._vertAppDisplay;

        // Now that controls are set up, connect the settings signal and apply initial state
        this._settingsSignal = this._settings.connect('changed::show-workspaces', () => this._updateWorkspacesVisibility());
        this._updateWorkspacesVisibility();

        this._injectionManager.overrideMethod(overviewControlsProto, '_updateAppDisplayVisibility', () => function(params = null) {
            if (!params) {
                params = this._stateAdjustment.getStateTransitionParams();
            }

            const {
                initialState,
                finalState
            } = params;
            const state = Math.max(initialState, finalState);

            extension._vertAppDisplay.visible =
                state > OverviewControls.ControlsState.WINDOW_PICKER &&
                !this._searchController.searchActive;

            // Focus the vertical app display
            if (extension._vertAppDisplay.visible) {
                global.stage.set_key_focus(extension._vertAppDisplay);
            }

            // Disable drag and drop on the original app grid to prevent internal errors when rearranging app icons in the dash
            extension._overviewControls.appDisplay._disconnectDnD();
        });

        // Fade out the app display when the search becomes active
        this._injectionManager.overrideMethod(overviewControlsProto, '_onSearchChanged', originalFn => function() {
            originalFn.call(this);

            const {
                searchActive
            } = this._searchController;

            extension._vertAppDisplay.ease({
                opacity: searchActive ? 0 : 255,
                duration: OverviewControls.SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        });

        // Rename the "Pin to Dash" item in the app menu
        this._injectionManager.overrideMethod(AppMenu.AppMenu.prototype, '_updateFavoriteItem', originalFn => function() {
            originalFn.call(this);

            if (this._toggleFavoriteItem.visible) {
                const text = this._appFavorites.isFavorite(this._app.id) ?
                    _('Remove from Favorites') :
                    _('Add to Favorites');

                this._toggleFavoriteItem.label.text = text;
            }
        });
    }

    disable() {
        this._overviewLayoutManager._appDisplay = this._overviewControls.appDisplay;

        this._overviewControls.remove_child(this._vertAppDisplay);
        this._injectionManager.clear();
        this._vertAppDisplay.destroy();

        this._overviewControls.appDisplay._disconnectDnD();
        this._overviewControls.appDisplay._connectDnD();

        // Disconnect settings signal and restore workspace visibility before clearing
        if (this._settingsSignal && this._settings) {
            try {
                this._settings.disconnect(this._settingsSignal);
            } catch (e) {}
            this._settingsSignal = null;
        }

        if (this._overviewShowingId && Main.overview && Main.overview.disconnect) {
            try {
                Main.overview.disconnect(this._overviewShowingId);
            } catch (e) {}
            this._overviewShowingId = null;
        }

        this._stopOverviewReadyPoll();

        // Restore workspace visibility when disabling
        try {
            if (this._updateWorkspacesVisibility && this._settings) {
                this._settings.set_boolean('show-workspaces', true);
                this._updateWorkspacesVisibility();
            }
        } catch (e) {}

        this._settings = null;
        this._vertAppDisplay = null;
        this._injectionManager = null;
        this._overviewControls = null;
        this._overviewLayoutManager = null;
    }
}