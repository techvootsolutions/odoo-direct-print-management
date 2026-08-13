import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { DirectPrintPreviewDialog } from "./direct_print_preview_dialog";
import {
    checkWkhtmltopdf,
    downloadReportPdfBlob,
    fetchReportPdf,
    getReportFilename,
} from "./report_utils";

/**
 * Global handler for ir.actions.report that opens a PDF print preview.
 *
 * Registered on the official Odoo 19 extension point:
 * registry.category("ir.actions.report handlers")
 */
async function directPrintReportHandler(action, options, env) {
    // Let IoT handle reports configured with physical printers.
    if (action.device_ids?.length) {
        return false;
    }

    if (action.report_type !== "qweb-pdf") {
        return false;
    }

    const { dialog, orm, ui } = env.services;

    const downloadContext = { ...user.context };
    if (action.context) {
        Object.assign(downloadContext, action.context);
    }

    const enabledPromise =
        action.direct_print_enabled !== undefined
            ? Promise.resolve(action.direct_print_enabled)
            : orm.call("ir.actions.report", "is_direct_print_enabled", []);

    const [directPrintEnabled, wkhtmlStatus] = await Promise.all([
        enabledPromise,
        checkWkhtmltopdf(),
    ]);

    if (!directPrintEnabled) {
        return false;
    }

    if (!["upgrade", "ok"].includes(wkhtmlStatus)) {
        return false;
    }

    ui.block();
    let previewUrl;
    let pdfBlob;
    let pdfFilename;
    try {
        ({ blob: pdfBlob, filename: pdfFilename } = await fetchReportPdf(action, downloadContext));
        previewUrl = URL.createObjectURL(pdfBlob);
    } catch {
        return false;
    } finally {
        ui.unblock();
    }

    const filename = pdfFilename || getReportFilename(action);

    await new Promise((resolve) => {
        dialog.add(
            DirectPrintPreviewDialog,
            {
                action,
                previewUrl,
                previewMode: "pdf",
                defaultPrinter: action.default_printer,
                userContext: downloadContext,
                autoPrint: true,
                downloadPdf: () => downloadReportPdfBlob(pdfBlob, filename),
            },
            { onClose: resolve }
        );
    });

    options.onClose?.();
    return true;
}

registry
    .category("ir.actions.report handlers")
    .add("direct_print_report_handler", directPrintReportHandler, { sequence: 50 });
