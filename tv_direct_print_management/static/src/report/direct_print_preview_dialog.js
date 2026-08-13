import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import {
    downloadReportPdf,
    printFromPdfPreviewIframe,
    printFromPreviewIframe,
    printViaClonedWindow,
} from "./report_utils";

export class DirectPrintPreviewDialog extends Component {
    static template = "tv_direct_print_management.DirectPrintPreviewDialog";
    static components = { Dialog };
    static props = {
        close: Function,
        action: Object,
        reportHtmlUrl: { type: String, optional: true },
        previewUrl: { type: String, optional: true },
        previewMode: { type: String, optional: true },
        title: { type: String, optional: true },
        defaultPrinter: { type: [Object, Boolean], optional: true },
        userContext: { type: Object, optional: true },
        autoPrint: { type: Boolean, optional: true },
        downloadPdf: { type: Function, optional: true },
    };
    static defaultProps = {
        autoPrint: true,
        defaultPrinter: false,
        previewMode: "html",
        userContext: {},
    };

    setup() {
        this.iframeRef = useRef("iframe");
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.state = useState({
            isLoading: true,
            defaultPrinter: this.props.defaultPrinter || false,
        });
        this.isPrinting = false;
        this.hasAutoPrinted = false;

        onMounted(() => {
            if (!this.state.defaultPrinter) {
                this._loadDefaultPrinter();
            }
        });

        onWillUnmount(() => {
            if (this.props.previewUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(this.props.previewUrl);
            }
        });
    }

    get previewSrc() {
        return this.props.previewUrl || this.props.reportHtmlUrl;
    }

    get isPdfPreview() {
        return this.props.previewMode === "pdf";
    }

    get dialogTitle() {
        return this.props.title || this.props.action.display_name || this.props.action.name || _t("Print Preview");
    }

    get defaultPrinterLabel() {
        const printer = this.state.defaultPrinter;
        if (!printer) {
            return _t("No default printer configured");
        }
        return printer.printer_name || printer.name;
    }

    async _loadDefaultPrinter() {
        const printer = await this.orm.call("printer.configuration", "get_default_printer", []);
        if (printer) {
            this.state.defaultPrinter = printer;
        }
    }

    async onViewerLoad() {
        this.state.isLoading = false;
        if (!this.props.autoPrint || this.hasAutoPrinted) {
            return;
        }
        this.hasAutoPrinted = true;
        await this.triggerPrint();
    }

    async triggerPrint() {
        if (this.isPrinting) {
            return;
        }
        const iframe = this.iframeRef.el;
        if (!iframe) {
            return;
        }
        this.isPrinting = true;
        try {
            if (this.isPdfPreview) {
                await printFromPdfPreviewIframe(iframe);
            } else {
                await printFromPreviewIframe(iframe);
            }
        } catch {
            if (this.isPdfPreview) {
                this.notification.add(
                    _t("Could not print. Use Download PDF and print the file manually."),
                    { type: "warning", title: _t("Print") }
                );
            } else {
                try {
                    await printViaClonedWindow(iframe);
                } catch (error) {
                    this.notification.add(
                        error.message ||
                            _t("Could not print. Use Download PDF and print the file manually."),
                        { type: "warning", title: _t("Print") }
                    );
                }
            }
        } finally {
            this.isPrinting = false;
        }
    }

    async onDownload() {
        if (this.props.downloadPdf) {
            await this.props.downloadPdf();
            return;
        }
        await downloadReportPdf(this.props.action, this.props.userContext);
    }

    onClose() {
        this.props.close();
    }
}
