import Store from 'electron-store';
import type { IgnoreRule } from '../../shared/types';

interface IgnoreStoreData {
    rules: IgnoreRule[];
}

const schema = {
    rules: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                availableVersion: { type: 'string' },
                until: { type: 'string' },
                createdAt: { type: 'string' }
            }
        },
        default: []
    }
};

export class IgnoreService {
    private readonly store: Store<IgnoreStoreData>;

    constructor() {
        this.store = new Store<IgnoreStoreData>({
            schema,
            name: 'ignored-updates',
            clearInvalidConfig: true
        });
    }

    private getAllRules(): IgnoreRule[] {
        return this.store.get('rules');
    }

    private persistRules(rules: IgnoreRule[]): void {
        this.store.set('rules', rules);
    }

    getActiveRules(referenceDate = new Date()): IgnoreRule[] {
        const now = referenceDate.getTime();
        const rules = this.getAllRules();
        const active = rules.filter((rule) => {
            const until = Date.parse(rule.until);
            return Number.isFinite(until) && until > now;
        });

        if (active.length !== rules.length) {
            this.persistRules(active);
        }

        return active;
    }

    addTemporaryIgnore(id: string, availableVersion: string | undefined, days: number): IgnoreRule {
        const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(30, Math.floor(days))) : 7;
        const createdAt = new Date();
        const until = new Date(createdAt.getTime() + safeDays * 24 * 60 * 60 * 1000);
        const nextRule: IgnoreRule = {
            id,
            ...(availableVersion?.trim() ? { availableVersion: availableVersion.trim() } : {}),
            createdAt: createdAt.toISOString(),
            until: until.toISOString()
        };

        const normalizedVersion = nextRule.availableVersion || '';
        const rules = this.getAllRules().filter((rule) => {
            if (rule.id !== id) return true;
            const existingVersion = (rule.availableVersion || '').trim();
            return existingVersion !== normalizedVersion;
        });
        rules.push(nextRule);
        this.persistRules(rules);
        return nextRule;
    }

    clearAll(): void {
        this.persistRules([]);
    }
}
