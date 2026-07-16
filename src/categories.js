/*
Category configuration for app grouping
Custom categories are stored in settings under 'custom-categories', so they
survive extension updates and do not require editing src/categories.js.

Define custom categories as JSON objects with:
 - name: string
 - enabled: boolean
 - merge: string|false
 - order: optional number
*/

import Gio from 'gi://Gio';

const _settings = new Gio.Settings({
    schema_id: 'org.gnome.shell.extensions.vertigrid'
});

export const DEFAULT_CATEGORIES = [{
        name: 'Development',
        enabled: true,
        merge: false
    },
    {
        name: 'Office',
        enabled: true,
        merge: false
    },
    {
        name: 'Network',
        enabled: true,
        merge: false
    },
    {
        name: 'AudioVideo',
        enabled: false,
        merge: false
    },
    {
        name: 'Audio',
        enabled: true,
        merge: false
    },
    {
        name: 'Video',
        enabled: true,
        merge: false
    },
    {
        name: 'Graphics',
        enabled: true,
        merge: false
    },
    {
        name: 'Education',
        enabled: true,
        merge: false
    },
    {
        name: 'Game',
        enabled: true,
        merge: false
    },
    {
        name: 'Utility',
        enabled: true,
        merge: false
    },
    {
        name: 'Accessories',
        enabled: true,
        merge: false
    },
    {
        name: 'System',
        enabled: true,
        merge: false
    },
    {
        name: 'Settings',
        enabled: true,
        merge: false
    }
];

function _normalizeCategory(category, defaultOrder) {
    if (!category || typeof category !== 'object') {
        return null;
    }

    const name = category.name ? String(category.name).trim() : '';
    if (!name) {
        return null;
    }

    let enabled = true;
    if (category.hasOwnProperty('enabled')) {
        enabled = Boolean(category.enabled);
    }

    let merge = false;
    if (category.hasOwnProperty('merge')) {
        if (category.merge === false || category.merge === null) {
            merge = false;
        } else {
            merge = String(category.merge).trim();
            if (merge === '') {
                merge = false;
            }
        }
    }

    const orderValue = Number(category.order);
    const order = Number.isFinite(orderValue) ? orderValue : null;

    return {
        name,
        enabled,
        merge,
        order,
        _defaultOrder: defaultOrder
    };
}

function _getSettingsString(key, fallback = '') {
    try {
        return _settings.get_string(key) || fallback;
    } catch (e) {
        log(`vertigrid: Failed to read ${key}: ${e}`);
        return fallback;
    }
}

function _getSettingsStrv(key, fallback = []) {
    try {
        return _settings.get_strv(key) || fallback;
    } catch (e) {
        log(`vertigrid: Failed to read ${key}: ${e}`);
        return fallback;
    }
}

function _loadCustomCategories() {
    const raw = _getSettingsString('custom-categories', '[]');
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((category, index) => _normalizeCategory(category, DEFAULT_CATEGORIES.length + index))
            .filter(Boolean);
    } catch (e) {
        log(`vertigrid: Failed to parse custom categories: ${e}`);
        return [];
    }
}

function _categoryNamesEqual(a, b) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function getCategories() {
    const categories = DEFAULT_CATEGORIES.map((category, index) => ({
        ...category,
        order: null,
        _defaultOrder: index
    }));

    const customCategories = _loadCustomCategories();
    for (const customCategory of customCategories) {
        const existingIndex = categories.findIndex(category => _categoryNamesEqual(category.name, customCategory.name));
        if (existingIndex >= 0) {
            categories[existingIndex] = {
                ...categories[existingIndex],
                ...customCategory
            };
        } else {
            categories.push(customCategory);
        }
    }

    categories.sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : a._defaultOrder;
        const bOrder = Number.isFinite(b.order) ? b.order : b._defaultOrder;
        return aOrder - bOrder;
    });

    return categories;
}

export function getCategoryOrder() {
    return getCategories()
        .filter(cat => cat.enabled && !cat.merge)
        .map(cat => cat.name);
}

export function getAllCategories() {
    return [...getCategories().map(cat => cat.name), 'Other'];
}

/** ========== DO NOT MODIFY THE FOLLOWING UNLESS YOU ARE A DEVELOPER ========== **/

export const CATEGORY_ORDER = getCategoryOrder();

export const ALL_CATEGORIES = getAllCategories();

function _loadOverrides() {
    const arr = _getSettingsStrv('app-category-overrides', []);
    // Map of appId -> { category: string, index: number|null }
    const map = new Map();
    for (const entry of arr) {
        const parts = entry.split('::');
        if (parts.length >= 2) {
            const id = parts[0];
            const category = parts[1];
            const index = parts.length >= 3 ? parseInt(parts[2], 10) : null;
            map.set(id, {
                category,
                index: Number.isFinite(index) ? index : null
            });
        }
    }
    return map;
}

export function setAppCategory(appId, category, index = null) {
    try {
        const arr = _settings.get_strv('app-category-overrides') || [];
        // remove existing for appId
        const filtered = arr.filter(e => !e.startsWith(appId + '::'));
        if (category && category !== 'Other') {
            if (index !== null && index !== undefined) {
                filtered.push(`${appId}::${category}::${Math.floor(index)}`);
            } else {
                filtered.push(`${appId}::${category}`);
            }
        }
        _settings.set_strv('app-category-overrides', filtered);
        return true;
    } catch (e) {
        log(`vertigrid: Failed to set app category override: ${e}`);
        return false;
    }
}

export function clearAppCategory(appId) {
    try {
        const arr = _settings.get_strv('app-category-overrides') || [];
        const filtered = arr.filter(e => !e.startsWith(appId + '::'));
        _settings.set_strv('app-category-overrides', filtered);
        return true;
    } catch (e) {
        log(`vertigrid: Failed to clear app category override: ${e}`);
        return false;
    }
}

export function getCategoryOrderMap() {
    // Returns Map category -> array of appIds sorted by index (asc)
    const overrides = _settings.get_strv('app-category-overrides') || [];
    const buckets = new Map();
    for (const entry of overrides) {
        const parts = entry.split('::');
        if (parts.length >= 2) {
            const id = parts[0];
            const category = parts[1];
            const index = parts.length >= 3 ? parseInt(parts[2], 10) : null;
            if (index !== null && Number.isFinite(index)) {
                if (!buckets.has(category)) buckets.set(category, []);
                buckets.get(category).push({
                    id,
                    index
                });
            }
        }
    }
    const result = new Map();
    for (const [cat, arr] of buckets) {
        arr.sort((a, b) => a.index - b.index);
        result.set(cat, arr.map(x => x.id));
    }
    return result;
}

function _isValidTargetCategory(currentCategories, name) {
    // A category is only safe to hand back to the app grid if it's
    // currently enabled and not itself merged elsewhere — i.e. exactly the
    // set getCategoryOrder() exposes. Anything else (a typo'd merge target,
    // a merge into a disabled/removed category, a stale override) must not
    // be returned as-is: the app grid only allocates buckets for that
    // valid set, so an unrecognized name causes it to crash when it tries
    // to push an app into a bucket that doesn't exist.
    return currentCategories.some(c =>
        c.enabled && !c.merge && _categoryNamesEqual(c.name, name)
    );
}

/**
 * Get the category for an app from its desktop file categories
 */
export function getAppCategory(appInfo) {
    try {
        const currentCategories = getCategories();

        const resolve = candidate =>
            _isValidTargetCategory(currentCategories, candidate) ? candidate : 'Other';

        // Check for user overrides first (e.g. drag-and-drop into a
        // category). The override still needs to be resolved through the
        // enabled/merge config below — an override pointing at a disabled
        // or merged category must not bypass that logic.
        try {
            const id = appInfo.get_id();
            const overrides = _loadOverrides();
            if (overrides.has(id)) {
                const overrideCategory = overrides.get(id).category;
                const catConfig = currentCategories.find(c => _categoryNamesEqual(c.name, overrideCategory));
                if (catConfig) {
                    if (!catConfig.enabled) {
                        return 'Other';
                    }
                    if (catConfig.merge) {
                        return resolve(catConfig.merge);
                    }
                    return resolve(catConfig.name);
                }
                // No config found for this category (e.g. it was removed
                // entirely) — fall back to the override value, but only if
                // it still resolves to something valid.
                return resolve(overrideCategory);
            }
        } catch (e) {
            // ignore if appInfo doesn't have get_id
        }
        const categories = appInfo.get_categories();
        if (!categories)
            return 'Other';

        const categoryList = Array.isArray(categories) ?
            categories.map(c => String(c).trim()).filter(Boolean) :
            categories.split(';').map(c => String(c).trim()).filter(Boolean);

        // Walk the app's OWN category list (in the order the .desktop file
        // lists them) rather than our config list. Apps commonly carry
        // several categories at once (e.g. "AudioVideo;Audio;Player;"), and
        // a disabled catch-all like AudioVideo should not block a more
        // specific, enabled/merged category like Audio from matching just
        // because it happens to come first in our config list.
        for (const trimmed of categoryList) {
            if (!trimmed) {
                continue;
            }
            const catConfig = currentCategories.find(c => _categoryNamesEqual(c.name, trimmed));
            if (!catConfig) {
                // Unknown category name to us, keep checking the app's
                // other listed categories.
                continue;
            }
            if (!catConfig.enabled) {
                // This particular category is disabled; the app might
                // still match a different, enabled category it also lists.
                continue;
            }
            if (catConfig.merge) {
                return resolve(catConfig.merge);
            }
            return resolve(catConfig.name);
        }
    } catch (e) {
        console.error('Error getting app category:', e);
    }
    return 'Other';
}