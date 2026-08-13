import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { DirectPrintPreviewDialog } from "./direct_print_preview_dialog";
import {
    downloadAccountReportPdf,
    fetchAccountReportPdf,
    getAccountReportTitle,
} from "./account_report_utils";
import { checkWkhtmltopdf } from "./report_utils";

const actionHandlers = registry.category("action_handlers");
const defaultAccountReportDownload = actionHandlers.get("ir_actions_account_report_download");

/**
 * Replace the default account report download handler for PDF exports when direct
 * print preview is enabled. Non-PDF exports and failures fall back to Odoo's handler.
 */
async function directPrintAccountReportDownload({ env, action, options }) {
    const { data } = action;

    if (data.file_generator !== "export_to_pdf") {
        return defaultAccountReportDownload({ env, action, options });
    }

    const enabledPromise =
        action.direct_print_enabled !== undefined
            ? Promise.resolve(action.direct_print_enabled)
            : env.services.orm.call("ir.actions.report", "is_direct_print_enabled", []);

    const [directPrintEnabled, wkhtmlStatus] = await Promise.all([
        enabledPromise,
        checkWkhtmltopdf(),
    ]);

    if (!directPrintEnabled || !["upgrade", "ok"].includes(wkhtmlStatus)) {
        return defaultAccountReportDownload({ env, action, options });
    }

    env.services.ui.block();
    let previewUrl;
    try {
        const { blob } = await fetchAccountReportPdf(data);
        previewUrl = URL.createObjectURL(blob);
    } catch {
        return defaultAccountReportDownload({ env, action, options });
    } finally {
        env.services.ui.unblock();
    }

    const title = getAccountReportTitle(action);

    await new Promise((resolve) => {
        env.services.dialog.add(
            DirectPrintPreviewDialog,
            {
                action: { display_name: title, name: title },
                previewUrl,
                previewMode: "pdf",
                title,
                defaultPrinter: action.default_printer,
                userContext: user.context,
                autoPrint: true,
                downloadPdf: () => downloadAccountReportPdf(data),
            },
            { onClose: resolve }
        );
    });

    options?.onClose?.();
}

actionHandlers.add("ir_actions_account_report_download", directPrintAccountReportDownload, {
    force: true,
});
