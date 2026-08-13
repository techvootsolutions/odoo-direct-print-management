import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { download, parse } from "@web/core/network/download";
import { ConnectionLostError, makeErrorFromResponse } from "@web/core/network/rpc";

/**
 * Parse a human-readable title from an account report download action.
 *
 * @param {Object} action
 * @returns {string}
 */
export function getAccountReportTitle(action) {
    try {
        const options = JSON.parse(action.data.options);
        return options.report_title || options.report_name || _t("Print Preview");
    } catch {
        return _t("Print Preview");
    }
}

function buildAccountReportFormData(data) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
        formData.append(key, value);
    }
    formData.append("token", "dummy-because-api-expects-one");
    if (odoo.csrf_token) {
        formData.append("csrf_token", odoo.csrf_token);
    }
    return formData;
}

/**
 * POST to /account_reports and return the PDF blob without triggering a download.
 *
 * @param {Object} data Action data ({ options, file_generator, ... })
 * @returns {Promise<{ blob: Blob, filename: string|null }>}
 */
export function fetchAccountReportPdf(data) {
    return new Promise((resolve, reject) => {
        const xhr = new browser.XMLHttpRequest();
        xhr.open("POST", "/account_reports");
        xhr.responseType = "blob";
        xhr.onload = () => {
            const mimetype = xhr.response.type;
            const header = (xhr.getResponseHeader("Content-Disposition") || "").replace(/;$/, "");
            const filename = header ? parse(header).parameters.filename : null;
            if (xhr.status === 200 && (mimetype !== "text/html" || filename)) {
                resolve({ blob: xhr.response, filename });
                return;
            }
            if (xhr.status === 502) {
                reject(new ConnectionLostError("/account_reports"));
                return;
            }
            const decoder = new FileReader();
            decoder.onload = () => {
                const contents = decoder.result;
                const doc = new DOMParser().parseFromString(contents, "text/html");
                const nodes =
                    doc.body.children.length === 0 ? [doc.body] : doc.body.children;
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
        };
        xhr.onerror = () => reject(new ConnectionLostError("/account_reports"));
        xhr.send(buildAccountReportFormData(data));
    });
}

/**
 * Trigger a file download for an accounting report using the standard endpoint.
 *
 * @param {Object} data Action data ({ options, file_generator, ... })
 * @returns {Promise<void>}
 */
export async function downloadAccountReportPdf(data) {
    await download({ url: "/account_reports", data });
}
