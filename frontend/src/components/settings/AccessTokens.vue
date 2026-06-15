<template>
    <div class="my-4">
        <!-- Create Token -->
        <h5 class="my-4 settings-subheading">{{ $t("CreateToken") }}</h5>
        <form class="mb-4" @submit.prevent="createToken">
            <div class="input-group">
                <input
                    v-model="newTokenName"
                    type="text"
                    class="form-control"
                    :placeholder="$t('TokenName')"
                    required
                />
                <button class="btn btn-primary" type="submit">
                    {{ $t("CreateToken") }}
                </button>
            </div>
        </form>

        <!-- Newly created token — show once -->
        <div v-if="createdToken" class="alert alert-warning mb-4">
            <strong>{{ $t("tokenCreatedOnce") }}</strong>
            <div class="input-group mt-2">
                <input
                    type="text"
                    class="form-control font-monospace"
                    readonly
                    :value="createdToken"
                />
                <button class="btn btn-outline-secondary" type="button" @click="copyToken">
                    {{ $t("CopyToken") }}
                </button>
            </div>
        </div>

        <!-- Usage hint -->
        <div class="mb-4">
            <p class="text-muted small mb-1">{{ $t("APIUsageHint") }}:</p>
            <pre class="bg-dark text-light rounded p-2 small" style="white-space: pre-wrap; word-break: break-all;">curl -X POST https://your-dockge-host/api/stacks/&lt;name&gt;/restart \
  -H "Authorization: Bearer &lt;token&gt;"</pre>
        </div>

        <!-- Token list -->
        <h5 class="my-4 settings-subheading">{{ $t("AccessTokens") }}</h5>

        <p v-if="tokens.length === 0" class="text-muted">{{ $t("NoTokens") }}</p>

        <table v-else class="table table-borderless">
            <thead>
                <tr>
                    <th>{{ $t("TokenName") }}</th>
                    <th>{{ $t("Created") }}</th>
                    <th>{{ $t("LastUsed") }}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="token in tokens" :key="token.id">
                    <td>{{ token.name }}</td>
                    <td>{{ formatDate(token.created_date) }}</td>
                    <td>{{ token.last_used_date ? formatDate(token.last_used_date) : "—" }}</td>
                    <td class="text-end">
                        <button
                            class="btn btn-sm btn-danger"
                            @click="confirmRevoke(token)"
                        >
                            {{ $t("RevokeToken") }}
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Revoke confirmation -->
        <Confirm
            ref="confirmRevokeModal"
            btn-style="btn-danger"
            :yes-text="$t('RevokeToken')"
            :no-text="$t('Leave')"
            @yes="revokeToken"
        >
            <p>{{ $t("confirmRevokeToken") }}</p>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";

export default {
    components: { Confirm },

    data() {
        return {
            tokens: [],
            newTokenName: "",
            createdToken: null,
            tokenToRevoke: null,
        };
    },

    mounted() {
        this.loadTokens();
    },

    methods: {
        loadTokens() {
            this.$root.getSocket().emit("listAccessTokens", (res) => {
                if (res.ok) {
                    this.tokens = res.tokens;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        createToken() {
            if (!this.newTokenName.trim()) {
                return;
            }
            this.$root.getSocket().emit("createAccessToken", this.newTokenName.trim(), (res) => {
                if (res.ok) {
                    this.createdToken = res.token;
                    this.newTokenName = "";
                    this.loadTokens();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        copyToken() {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(this.createdToken).then(() => {
                    this.$root.toastSuccess("Copied");
                });
            }
        },

        confirmRevoke(token) {
            this.tokenToRevoke = token;
            this.$refs.confirmRevokeModal.show();
        },

        revokeToken() {
            if (!this.tokenToRevoke) {
                return;
            }
            this.$root.getSocket().emit("revokeAccessToken", this.tokenToRevoke.id, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.tokenToRevoke = null;
                    this.loadTokens();
                }
            });
        },

        formatDate(dateStr) {
            if (!dateStr) return "—";
            return new Date(dateStr).toLocaleString();
        },
    },
};
</script>
