/*
Category configuration for app grouping
Set `enabled: false` for categories you want to hide - they will be merged into "Other"
Set `merge: 'TargetCategory'` to merge this category into another category
Change the order of categories in the array to change their display order in the grid

Restart GNOME desktop environment to apply changes
Note: Changes to categories will not take effect until you restart GNOME desktop environment
*/

import Gio from 'gi://Gio';

const _settings = new Gio.Settings({
    schema_id: 'org.gnome.shell.extensions.vertigrid'
});

export const CATEGORIES = [{
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
        name: 'Security',
        enabled: true,
        merge: false
    },
    {
        name: 'Chat',
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
    },
];


/** ========== 如果你不是开发人员，不要不要修改以下内容 ========== **/
/** ========== DO NOT MODIFY THE FOLLOWING UNLESS YOU ARE A DEVELOPER ========== **/

export const CATEGORY_ORDER = CATEGORIES
    .filter(cat => cat.enabled && !cat.merge)
    .map(cat => cat.name);

export const ALL_CATEGORIES = [
    ...CATEGORIES.map(cat => cat.name),
    'Other',
];

function _loadOverrides() {
    const arr = _settings.get_strv('app-category-overrides') || [];
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

/**
 * Get the category for an app from its desktop file categories
 */
export function getAppCategory(appInfo) {
    try {
        // Check for user overrides first
        try {
            const id = appInfo.get_id();
            const overrides = _loadOverrides();
            if (overrides.has(id)) {
                return overrides.get(id).category;
            }
        } catch (e) {
            // ignore if appInfo doesn't have get_id
        }
        const categories = appInfo.get_categories();
        if (!categories)
            return 'Other';

        for (const catConfig of CATEGORIES) {
            if (categories.includes(catConfig.name)) {
                if (!catConfig.enabled) {
                    return 'Other';
                }
                if (catConfig.merge) {
                    return catConfig.merge;
                }
                return catConfig.name;
            }
        }

        const categoryList = categories.split(';');
        for (const cat of categoryList) {
            const trimmed = cat.trim();
            if (trimmed && ALL_CATEGORIES.includes(trimmed)) {
                const catConfig = CATEGORIES.find(c => c.name === trimmed);
                if (catConfig) {
                    if (!catConfig.enabled) {
                        return 'Other';
                    }
                    if (catConfig.merge) {
                        return catConfig.merge;
                    }
                }
                return trimmed;
            }
        }
    } catch (e) {
        console.error('Error getting app category:', e);
    }
    return 'Other';
}