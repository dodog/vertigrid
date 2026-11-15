import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

// Puts the vertical app display into the overview in place of the stock app
// grid. Everything done here is undone in destroy().
export class OverviewOverrides {
    constructor(settings, appDisplay, blurBackground) {
        this._settings = settings;
        this._appDisplay = appDisplay;
        this._blurBackground = blurBackground;
        this._injectionManager = new InjectionManager();

        // Private, but the only way to reach the controls
        this._controls = Main.overview._overview.controls;

        this._attachAppDisplay();
        this._installLayoutOverrides();
        this._installControlsOverrides();

        this._settingsIds = [
            this._settings.connect('changed::show-workspaces', () => this._relayout()),
            this._settings.connect('changed::blur-app-grid-background', () => this._updateBlur())
        ];

        this._relayout();
    }

    destroy() {
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._settingsIds = null;

        this._injectionManager.clear();
        this._injectionManager = null;

        const controls = this._controls;
        controls.layout_manager._appDisplay = controls.appDisplay;
        controls.remove_child(this._appDisplay);
        controls.appDisplay._disconnectDnD();
        controls.appDisplay._connectDnD();

        this._relayout();
        this._controls = null;
    }

    _attachAppDisplay() {
        const controls = this._controls;

        controls.add_child(this._appDisplay);
        controls.set_child_below_sibling(this._appDisplay, controls._workspacesDisplay);
        controls.layout_manager._appDisplay = this._appDisplay;

        // Drag and drop on the stock app grid errors when icons are rearranged in the dash
        controls.appDisplay._disconnectDnD();
    }

    _relayout() {
        this._controls.layout_manager.layout_changed();
        this._controls.queue_relayout();
    }

    _updateBlur() {
        this._blurBackground.setVisible(this._appDisplay.visible &&
            this._settings.get_boolean('blur-app-grid-background'));
    }

    // With workspaces hidden, give their space to the app grid.
    _installLayoutOverrides() {
        const self = this;
        const layoutManagerProto = Object.getPrototypeOf(this._controls.layout_manager);

        this._injectionManager.overrideMethod(layoutManagerProto, '_getAppDisplayBoxForState', originalFn => function (state, box, searchHeight, dashHeight, workspacesBox, spacing) {
            if (self._settings.get_boolean('show-workspaces'))
                return originalFn.call(this, state, box, searchHeight, dashHeight, workspacesBox, spacing);

            // Same shape as the stock method, with the workspace preview height treated as 0
            const [width, height] = box.get_size();
            const {y1: startY} = this._workAreaBox;
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

            appDisplayBox.set_size(width, height - searchHeight - spacing - dashHeight - spacing);

            return appDisplayBox;
        });

        // Keep the workspaces at a valid size but move them off-screen instead of hiding them
        this._injectionManager.overrideMethod(layoutManagerProto, '_computeWorkspacesBoxForState', originalFn => function (state, box, searchHeight, dashHeight, thumbnailsHeight, spacing) {
            const workspaceBox = originalFn.call(this, state, box, searchHeight, dashHeight, thumbnailsHeight, spacing);

            if (self._settings.get_boolean('show-workspaces') || state !== OverviewControls.ControlsState.APP_GRID)
                return workspaceBox;

            const [width, height] = workspaceBox.get_size();
            workspaceBox.set_origin(0, box.y2);
            workspaceBox.set_size(width, height);

            return workspaceBox;
        });
    }

    _installControlsOverrides() {
        const self = this;
        const controlsProto = OverviewControls.ControlsManager.prototype;

        this._injectionManager.overrideMethod(controlsProto, '_updateAppDisplayVisibility', () => function (params = null) {
            const {initialState, finalState} = params ?? this._stateAdjustment.getStateTransitionParams();
            const state = Math.max(initialState, finalState);

            self._appDisplay.visible =
                state > OverviewControls.ControlsState.WINDOW_PICKER &&
                !this._searchController.searchActive;

            self._updateBlur();

            if (self._appDisplay.visible)
                global.stage.set_key_focus(self._appDisplay);
        });

        // Fade out the app display while searching
        this._injectionManager.overrideMethod(controlsProto, '_onSearchChanged', originalFn => function () {
            originalFn.call(this);

            self._appDisplay.ease({
                opacity: this._searchController.searchActive ? 0 : 255,
                duration: OverviewControls.SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            });
        });
    }
}
