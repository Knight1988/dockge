import { R } from "redbean-node";
import { BeanModel } from "redbean-node/dist/bean-model";
import { shake256 } from "../password-hash";
import { genSecret } from "../../common/util-common";

export class AccessToken extends BeanModel {

    /**
     * Hash a plaintext token for safe storage.
     */
    static hashToken(plaintext: string): string {
        return shake256(plaintext, 32);
    }

    /**
     * Create a new access token for a user.
     * Returns the plaintext token — store it, it won't be retrievable again.
     */
    static async create(userID: number, name: string): Promise<string> {
        const plaintext = "dockge_" + genSecret(40);
        const bean = R.dispense("access_token");
        bean.user_id = userID;
        bean.name = name;
        bean.token = AccessToken.hashToken(plaintext);
        bean.created_date = new Date().toISOString();
        bean.last_used_date = null;
        bean.active = true;
        await R.store(bean);
        return plaintext;
    }

    /**
     * Look up the user ID for a given plaintext bearer token.
     * Updates last_used_date if valid; returns null if invalid/revoked.
     */
    static async getUserIDByToken(plaintext: string): Promise<number | null> {
        const hash = AccessToken.hashToken(plaintext);
        const tokenBean = await R.findOne("access_token", " token = ? AND active = 1 ", [ hash ]);
        if (!tokenBean) {
            return null;
        }

        // Confirm the owning user is still active
        const user = await R.findOne("user", " id = ? AND active = 1 ", [ tokenBean.user_id ]);
        if (!user) {
            return null;
        }

        // Update last used time (fire-and-forget)
        tokenBean.last_used_date = new Date().toISOString();
        R.store(tokenBean).catch(() => { /* ignore update errors */ });

        return tokenBean.user_id as number;
    }

    /**
     * Return a public-safe JSON representation (no token hash).
     */
    toPublicJSON(): object {
        return {
            id: this.id,
            name: this.name,
            created_date: this.created_date,
            last_used_date: this.last_used_date,
        };
    }
}

export default AccessToken;
