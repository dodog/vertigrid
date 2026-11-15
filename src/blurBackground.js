import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

// Blurred wallpaper backdrop shown behind the app grid.
export class BlurBackground {
    constructor() {
        this._actor = new St.Widget({
            reactive: false,
            visible: false
        });
        this._actor.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL
        }));

        this._managers = Main.layoutManager.monitors.map((_monitor, index) =>
            new Background.BackgroundManager({
                container: this._actor,
                layoutManager: Main.layoutManager,
                monitorIndex: index,
                vignette: false
            }));

        this._actor.add_effect(new Shell.BlurEffect({
            radius: 60,
            brightness: 0.75,
            mode: Shell.BlurMode.ACTOR
        }));

        Main.layoutManager.overviewGroup.insert_child_at_index(this._actor, 0);
    }

    setVisible(visible) {
        this._actor.visible = visible;
    }

    destroy() {
        this._managers.forEach(manager => manager.destroy());
        this._managers = null;

        this._actor.destroy();
        this._actor = null;
    }
}
