/*
应用分组分类配置
Category configuration for app grouping
将不想显示的分类设为 `enabled: false` - 它们将被合并到"其他"中
Set `enabled: false` for categories you want to hide - they will be merged into "Other"
设置 `merge: '目标分类'` 将此分类合并到另一个分类中
Set `merge: 'TargetCategory'` to merge this category into another category
调整分类在数组中的顺序，以改变它们在网格中的显示顺序。
Change the order of categories in the array to change their display order in the grid

注意！需要重启GNOME桌面环境才能生效
Restart GNOME desktop environment to apply changes
Note: Changes to categories will not take effect until you restart GNOME desktop environment
*/

import Gio from 'gi://Gio';

const _settings = new Gio.Settings({
    schema_id: 'org.gnome.shell.extensions.vertigrid'
});

export const CATEGORIES = [
    // 开发工具
    {
        name: 'Development',
        enabled: true,
        merge: false
    },
    // 办公软件
    {
        name: 'Office',
        enabled: true,
        merge: false
    },
    // 网络工具
    {
        name: 'Network',
        enabled: true,
        merge: false
    },
    // 多媒体
    {
        name: 'AudioVideo',
        enabled: true,
        merge: false
    },
    // 音频
    {
        name: 'Audio',
        enabled: true,
        merge: false
    },
    // 视频
    {
        name: 'Video',
        enabled: true,
        merge: false
    },
    // 图像图形
    {
        name: 'Graphics',
        enabled: true,
        merge: false
    },
    // 图像图形
    {
        name: 'Crypto',
        enabled: true,
        merge: false
    },
    {
        name: 'Translate',
        enabled: true,
        merge: false
    },
    {
        name: 'Webdesign',
        enabled: true,
        merge: false
    },
    {
        name: 'Nastaveniasys',
        enabled: true,
        merge: false
    },
    {
        name: 'Flatpak',
        enabled: true,
        merge: false
    },
    {
        name: 'Ebook',
        enabled: true,
        merge: false
    },
    {
        name: 'Hardware',
        enabled: true,
        merge: false
    },
    {
        name: 'Money',
        enabled: true,
        merge: false
    },
    {
        name: 'Backup',
        enabled: true,
        merge: false
    },
    {
        name: 'authy',
        enabled: true,
        merge: false
    },
    {
        name: 'Messengers',
        enabled: true,
        merge: false
    },
    {
        name: 'Fonty',
        enabled: true,
        merge: false
    },

    // 教育软件
    {
        name: 'Education',
        enabled: true,
        merge: false
    },
    // 游戏
    {
        name: 'Game',
        enabled: true,
        merge: false
    },
    // 小工具
    {
        name: 'Utility',
        enabled: true,
        merge: false
    },
    // 附件
    {
        name: 'Accessories',
        enabled: true,
        merge: false
    },
    // 系统工具
    {
        name: 'System',
        enabled: true,
        merge: false
    },
    // 系统设置
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