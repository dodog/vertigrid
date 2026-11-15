import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Pointer travel (px) before a press on an icon turns into a drag.
const DRAG_THRESHOLD = 8;

const DROP_HIGHLIGHT_STYLE = [
    'box-shadow: inset 0 0 0 2px rgba(255,255,255,0.08);',
    'background-color: rgba(255,255,255,0.02); border-radius: 12px;'
].join(' ');

// Drag-and-drop of app icons between and within the category sections.
//
// getViews() returns the current {category: viewport} map, and onDrop(category,
// appIds) is called with the new order of the category that received the icon.
export class DragController {
    constructor(settings, getViews, onDrop) {
        this._settings = settings;
        this._getViews = getViews;
        this._onDrop = onDrop;

        this._dragActor = null;
        this._dragGhost = null;
        this._highlightedView = null;
        this._dragCapturedHandler = null;
        this._pendingMotionId = null;
        this._pendingReleaseId = null;
    }

    attach(appIcon) {
        appIcon.reactive = true;

        appIcon.connect('button-press-event', (actor, event) => {
            const [startX, startY] = event.get_coords();

            this._cancelPending();

            this._pendingMotionId = global.stage.connect('motion-event', (_stage, motionEvent) => {
                const [x, y] = motionEvent.get_coords();
                if ((x - startX) ** 2 + (y - startY) ** 2 >= DRAG_THRESHOLD ** 2) {
                    this._cancelPending();
                    this._startDrag(actor);
                }
                return Clutter.EVENT_PROPAGATE;
            });

            this._pendingReleaseId = global.stage.connect('button-release-event', () => {
                this._cancelPending();
                return Clutter.EVENT_PROPAGATE;
            });

            return Clutter.EVENT_PROPAGATE;
        });

        // A click that launches the app can consume the release before the
        // stage listener above sees it, so also cancel from the icon itself.
        appIcon.connect('button-release-event', () => {
            this._cancelPending();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    // Cancels a pending or running drag. Also needed when the overview closes,
    // since a launched app can swallow the release event.
    cancel() {
        this._cancelPending();
        this._cancelActive();
    }

    _startDrag(actor) {
        this._cancelActive();
        this._setEmptyDropTargetsActive(true);

        this._dragActor = actor;
        this._dragGhost = new Clutter.Clone({
            source: actor,
            opacity: 200,
            scale_x: 0.9,
            scale_y: 0.9,
            reactive: false
        });
        Main.uiGroup.add_child(this._dragGhost);

        this._dragCapturedHandler = global.stage.connect('captured-event',
            (_stage, event) => this._onEvent(event));
    }

    _onEvent(event) {
        switch (event.type()) {
        case Clutter.EventType.MOTION:
            this._onMotion(event);
            return Clutter.EVENT_STOP;
        case Clutter.EventType.BUTTON_RELEASE:
            this._onRelease(event);
            // Consume the release too: otherwise the Shell's background-click
            // handler would see a drop onto empty space and close the overview.
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _onMotion(event) {
        const [x, y] = event.get_coords();
        this._dragGhost.set_position(
            Math.floor(x - this._dragGhost.width / 2),
            Math.floor(y - this._dragGhost.height / 2));

        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        const {view} = this._findView(target);
        if (view === this._highlightedView)
            return;

        this._highlightedView?.set_style('');
        this._highlightedView = view;
        this._highlightedView?.set_style(DROP_HIGHLIGHT_STYLE);
    }

    _onRelease(event) {
        const [x, y] = event.get_coords();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        const {view, category} = this._findView(target);

        if (view) {
            const draggedId = this._dragActor._appId;
            const insertIndex = this._computeInsertIndex(view, x, y);

            // The order of every app in the category, not just the dragged one
            const ids = view.get_children()
                .map(child => child._appId)
                .filter(id => id && id !== draggedId);
            ids.splice(Math.min(insertIndex, ids.length), 0, draggedId);

            this._onDrop(category, ids);
        }

        this._cancelActive();
    }

    _cancelPending() {
        if (this._pendingMotionId) {
            global.stage.disconnect(this._pendingMotionId);
            this._pendingMotionId = null;
        }
        if (this._pendingReleaseId) {
            global.stage.disconnect(this._pendingReleaseId);
            this._pendingReleaseId = null;
        }
    }

    _cancelActive() {
        this._setEmptyDropTargetsActive(false);

        if (this._dragCapturedHandler) {
            global.stage.disconnect(this._dragCapturedHandler);
            this._dragCapturedHandler = null;
        }
        if (this._dragGhost) {
            this._dragGhost.destroy();
            this._dragGhost = null;
        }
        if (this._highlightedView) {
            this._highlightedView.set_style('');
            this._highlightedView = null;
        }
        this._dragActor = null;
    }

    _findView(actor) {
        for (let target = actor; target; target = target.get_parent()) {
            for (const [category, view] of Object.entries(this._getViews())) {
                if (view === target)
                    return {view, category};
            }
        }

        return {view: null, category: null};
    }

    // Where in the view a drop at the given stage coordinates should land.
    // Runs VerticalLayout's placement formula (col = i % columns,
    // row = floor(i / columns)) in reverse, so it works whether the pointer is
    // over an icon or over a gap.
    _computeInsertIndex(view, stageX, stageY) {
        const children = view.get_children();
        const [viewX, viewY] = view.get_transformed_position();

        const layout = view.layout_manager;
        const columns = Math.max(1, layout._columns);
        const cellSize = layout._getMinChildSize(children) + layout._spacing;

        if (cellSize <= 0 || children.length === 0)
            return children.length;

        const col = Math.min(columns - 1, Math.max(0, Math.floor((stageX - viewX) / cellSize)));
        const row = Math.max(0, Math.floor((stageY - viewY) / cellSize));

        return Math.min(row * columns + col, children.length);
    }

    // Gives empty category viewports a pickable area for the duration of a
    // drag so they can be drop targets. VerticalLayout reports [0, 0] for an
    // empty view, which ignores CSS min sizes, so a real invisible child is
    // used instead.
    _setEmptyDropTargetsActive(active) {
        const size = this._settings.get_int('icon-size');

        for (const view of Object.values(this._getViews())) {
            if (active) {
                if (view.get_n_children() === 0) {
                    view._dropPlaceholder = new St.Widget({width: size, height: size});
                    view.add_child(view._dropPlaceholder);
                }
            } else if (view._dropPlaceholder) {
                view._dropPlaceholder.destroy();
                view._dropPlaceholder = null;
            }
        }
    }
}
