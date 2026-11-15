import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

/*
Custom scroll view with animated scrolling and precise child targeting.
Used as the single scrolling container for the whole vertical app grid.
*/
export const VerticalScrollView = GObject.registerClass({
    GTypeName: 'Vertigrid_VerticalScrollView'
}, class VerticalScrollView extends St.ScrollView {
    constructor(settings) {
        super({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER
        });

        this._settings = settings;
        this._scroll = 0;
        this._trackpadTime = 0;

        this._content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: false,
            y_expand: false
        });
        this.set_child(this._content);
    }

    // The box holding the scrolled content; sections are added to this
    get content() {
        return this._content;
    }

    get scroll() {
        return this._scroll;
    }

    // The child's vertical offset from the top of the scroll content, in
    // the same coordinate space as vadjustment.value.
    getChildY(child) {
        let childY = child.get_allocation_box().y1;

        for (let actor = child.get_parent(); actor !== this; actor = actor.get_parent())
            childY += actor.get_allocation_box().y1;

        return childY;
    }

    scrollToChild(child, align = 'center') {
        const childY = this.getChildY(child);

        let scroll;
        if (align === 'top') {
            const topPadding = 8;
            scroll = childY - topPadding;
        } else {
            const childCenter = childY + child.get_allocation_box().get_height() / 2;
            scroll = childCenter - this.vadjustment.page_size / 2;
        }

        this.scrollTo(scroll);
    }

    scrollTo(scroll, animate = true, duration = 200) {
        const adjustment = this.vadjustment;

        const min = adjustment.lower;
        const max = adjustment.upper - adjustment.page_size;
        const scrollClamped = Math.clamp(scroll, min, max);

        // Skip zero-distance scrolls so holding a key does not retrigger the animation
        if (this.scroll === scrollClamped)
            return Clutter.EVENT_STOP;

        this._scroll = scrollClamped;

        if (animate) {
            adjustment.ease(scrollClamped, {
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC
            });
        } else {
            adjustment.remove_transition('value');
            adjustment.value = scrollClamped;
        }

        return Clutter.EVENT_STOP;
    }

    vfunc_scroll_event(event) {
        if (this._settings.get_boolean('animate-scroll'))
            return this._animateScroll(event);

        return super.vfunc_scroll_event(event);
    }

    _animateScroll(event) {
        if (event.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED)
            return Clutter.EVENT_STOP;

        const now = GLib.get_monotonic_time();
        const adjustment = this.vadjustment;

        const direction = event.get_scroll_direction();
        const step = adjustment.page_size ** (2 / 3);

        let delta = 0;
        let animate = false;

        if (direction === Clutter.ScrollDirection.SMOOTH) {
            // Trackpads sometimes emit events without a smooth delta; the
            // timestamp debounces those to avoid sudden jumps
            this._trackpadTime = now;

            delta = event.get_scroll_delta()[Clutter.Orientation.VERTICAL] || 0;
        } else if (now - this._trackpadTime > 1000 * 1000) {
            if (direction === Clutter.ScrollDirection.UP)
                delta = -1;
            else if (direction === Clutter.ScrollDirection.DOWN)
                delta = 1;

            animate = true;
        }

        const min = adjustment.lower;
        const max = adjustment.upper - adjustment.page_size;

        const clampedScroll = Math.clamp(this.scroll + delta * step, min, max);
        const distance = Math.abs(this.scroll - clampedScroll);

        if (distance === 0)
            return Clutter.EVENT_STOP;

        return this.scrollTo(clampedScroll, animate, (distance / 100) * 200);
    }
});
