<script lang="ts">
    import { toasts, dismissToast } from './store';
</script>

<div class="toast-container">
    {#each $toasts as toast (toast.id)}
        <div class="toast {toast.kind}" role="alert">
            <span class="toast-message">{toast.message}</span>
            <button
                class="toast-close"
                aria-label="Dismiss notification"
                onclick={() => dismissToast(toast.id)}
            >×</button>
        </div>
    {/each}
</div>
