import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { download, downloadFile, parse } from "@web/core/network/download";
import { ConnectionLostError, makeErrorFromResponse, rpc } from "@web/core/network/rpc";
import { getReportUrl } from "@web/webclient/actions/reports/utils";

const LOAD_TIMEOUT_MS = 30000;
const PRINT_SETTLE_MS = 300;

/**
 * Check wkhtmltopdf availability (cached per session).
 *
 * @returns {Promise<string>}
 */
export async function checkWkhtmltopdf() {
    checkWkhtmltopdf.statusProm ||= rpc("/report/check_wkhtmltopdf");
    return checkWkhtmltopdf.statusProm;
}

/**
 * Build the direct server URL for a report PDF.
 *
 * @param {Object} action
 * @param {Object} userContext
 * @returns {string}
 */
export function getReportPdfUrl(action, userContext) {
    return getReportUrl(action, "pdf", userContext);
}

function buildReportDownloadFormData(action, userContext) {
    const url = getReportPdfUrl(action, userContext);
    const formData = new FormData();
    formData.append("data", JSON.stringify([url, action.report_type]));
    formData.append("context", JSON.stringify(userContext));
    formData.append("token", "dummy-because-api-expects-one");
    if (odoo.csrf_token) {
        formData.append("csrf_token", odoo.csrf_token);
    }
    return formData;
}

function readBlobDownloadResponse(xhr, requestUrl, resolve, reject) {
    const mimetype = xhr.response.type;
    const header = (xhr.getResponseHeader("Content-Disposition") || "").replace(/;$/, "");
    const filename = header ? parse(header).parameters.filename : null;
    if (xhr.status === 200 && (mimetype !== "text/html" || filename)) {
        resolve({ blob: xhr.response, filename });
        return;
    }
    if (xhr.status === 502) {
        reject(new ConnectionLostError(requestUrl));
        return;
    }
    const decoder = new FileReader();
    decoder.onload = () => {
        const contents = decoder.result;
        const doc = new DOMParser().parseFromString(contents, "text/html");
        const nodes = doc.body.children.length === 0 ? [doc.body] : doc.body.children;
        let errorPayload;
        try {
            const node = nodes[1] || nodes[0];
            errorPayload = JSON.parse(node.textContent);
        } catch {
            errorPayload = {
                message: "Arbitrary Uncaught Python Exception",
                data: {
                    debug:
                        `${xhr.status}\n` +
                        `${nodes.length > 0 ? nodes[0].textContent : ""}\n` +
                        `${nodes.length > 1 ? nodes[1].textContent : ""}`,
                },
            };
        }
        reject(makeErrorFromResponse(errorPayload));
    };
    decoder.readAsText(xhr.response);
}

/**
 * Fetch a QWeb report PDF via the standard /report/download endpoint without
 * triggering a browser download. Uses the same server path as Download PDF.
 *
 * @param {Object} action
 * @param {Object} userContext
 * @returns {Promise<{ blob: Blob, filename: string|null }>}
 */
export function fetchReportPdf(action, userContext) {
    return new Promise((resolve, reject) => {
        const xhr = new browser.XMLHttpRequest();
        xhr.open("POST", "/report/download");
        xhr.responseType = "blob";
        xhr.onload = () => readBlobDownloadResponse(xhr, "/report/download", resolve, reject);
        xhr.onerror = () => reject(new ConnectionLostError("/report/download"));
        xhr.send(buildReportDownloadFormData(action, userContext));
    });
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Wait until an HTML report iframe has finished loading.
 *
 * @param {HTMLIFrameElement} iframe
 * @returns {Promise<void>}
 */
export function waitForHtmlIframeLoad(iframe) {
    if (!iframe) {
        return Promise.reject(new Error(_t("Report preview failed to load.")));
    }
    if (iframe.contentDocument?.readyState === "complete") {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            reject(new Error(_t("Report preview timed out.")));
        }, LOAD_TIMEOUT_MS);
        iframe.addEventListener(
            "load",
            () => {
                window.clearTimeout(timeout);
                resolve();
            },
            { once: true }
        );
    });
}

/**
 * Apply the same iframe body fixes Odoo uses in ReportAction.
 *
 * @param {HTMLIFrameElement} iframe
 */
export function applyReportIframeFixes(iframe) {
    const body = iframe.contentDocument?.body;
    if (!body) {
        return;
    }
    body.classList.add("o_in_iframe", "container-fluid");
    body.classList.remove("container");
    iframe.style.height = `${body.scrollHeight}px`;
}

/**
 * Inject print styles into the report iframe.
 * Chrome can print blank pages when report CSS uses overflow:hidden.
 *
 * @param {HTMLIFrameElement} iframe
 */
export function injectReportPrintStyles(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || doc.getElementById("o_direct_print_style")) {
        return;
    }
    const style = doc.createElement("style");
    style.id = "o_direct_print_style";
    style.textContent = `
        @media print {
            html, body, #wrapwrap, main, .article, .page, .o_body_html, .o_body_pdf {
                overflow: visible !important;
                height: auto !important;
                min-height: 0 !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: static !important;
            }
            body {
                margin: 0 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    `;
    doc.head.appendChild(style);
}

/**
 * Print from a PDF preview iframe (blob URL or embedded PDF viewer).
 *
 * @param {HTMLIFrameElement} iframe
 * @returns {Promise<void>}
 */
export async function printFromPdfPreviewIframe(iframe) {
    await waitForHtmlIframeLoad(iframe);
    await delay(PRINT_SETTLE_MS);

    const win = iframe.contentWindow;
    if (!win) {
        throw new Error(_t("Print window is not available."));
    }
    win.focus();
    win.print();
}

/**
 * Print from the visible preview iframe (Chrome renders off-screen iframes as blank).
 *
 * @param {HTMLIFrameElement} iframe
 * @returns {Promise<void>}
 */
export async function printFromPreviewIframe(iframe) {
    await waitForHtmlIframeLoad(iframe);
    applyReportIframeFixes(iframe);
    injectReportPrintStyles(iframe);
    await delay(PRINT_SETTLE_MS);

    const win = iframe.contentWindow;
    if (!win) {
        throw new Error(_t("Print window is not available."));
    }

    win.focus();
    win.print();
}

/**
 * Fallback: clone the loaded report HTML into a short-lived print window.
 *
 * @param {HTMLIFrameElement} iframe
 * @returns {Promise<void>}
 */
export function printViaClonedWindow(iframe) {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) {
        return Promise.reject(new Error(_t("Report content is not available for printing.")));
    }
    applyReportIframeFixes(iframe);
    injectReportPrintStyles(iframe);

    return new Promise((resolve, reject) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            reject(new Error(_t("Could not open the print window. Allow popups for this site.")));
            return;
        }
        printWindow.document.open();
        printWindow.document.write(doc.documentElement.outerHTML);
        printWindow.document.close();

        const startedAt = Date.now();
        const tryPrint = () => {
            try {
                if (printWindow.document.readyState === "complete") {
                    printWindow.focus();
                    printWindow.print();
                    printWindow.addEventListener(
                        "afterprint",
                        () => {
                            printWindow.close();
                            resolve();
                        },
                        { once: true }
                    );
                    window.setTimeout(() => {
                        printWindow.close();
                        resolve();
                    }, 120000);
                } else if (Date.now() - startedAt > LOAD_TIMEOUT_MS) {
                    printWindow.close();
                    reject(new Error(_t("Print timed out.")));
                } else {
                    window.setTimeout(tryPrint, 50);
                }
            } catch (error) {
                printWindow.close();
                reject(error);
            }
        };
        tryPrint();
    });
}

/**
 * Trigger a file download for a report using the standard Odoo endpoint.
 *
 * @param {Object} action
 * @param {Object} userContext
 * @returns {Promise<void>}
 */
export async function downloadReportPdf(action, userContext) {
    const url = getReportPdfUrl(action, userContext);
    await download({
        url: "/report/download",
        data: {
            data: JSON.stringify([url, action.report_type]),
            context: JSON.stringify(userContext),
        },
    });
}

/**
 * Download a report PDF blob using the same bytes shown in the preview.
 *
 * @param {Blob} blob
 * @param {string} [filename]
 * @returns {Promise<void>}
 */
export function downloadReportPdfBlob(blob, filename) {
    downloadFile(blob, filename || "report.pdf", "application/pdf");
}

/**
 * Build a safe filename for the report download.
 *
 * @param {Object} action
 * @returns {string}
 */
export function getReportFilename(action) {
    const baseName = action.display_name || action.name || "report";
    return `${baseName}.pdf`;
}
