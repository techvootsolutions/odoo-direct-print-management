# -*- coding: utf-8 -*-
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)


class IrActionsReport(models.Model):
    _inherit = "ir.actions.report"

    @api.model
    def is_direct_print_enabled(self):
        """Check whether the direct print preview workflow is enabled."""
        return self.env["ir.config_parameter"].sudo().get_param(
            "tv_direct_print_management.enabled", False
        )

    def report_action(self, docids, data=None, config=True):
        """Enrich the report action with direct-print metadata for the web client."""
        action = super().report_action(docids, data=data, config=config)
        if isinstance(action, dict) and action.get("type") == "ir.actions.report":
            action["direct_print_enabled"] = self.is_direct_print_enabled()
            default_printer = self.env["printer.configuration"].get_default_printer()
            if default_printer:
                action["default_printer"] = default_printer
        return action


class AccountReport(models.Model):
    _inherit = "account.report"

    def dispatch_report_action(
        self,
        options,
        action,
        action_param=None,
        on_sections_source=False,
    ):
        """Attach direct-print metadata to PDF export actions for the web client."""
        result = super().dispatch_report_action(
            options,
            action,
            action_param=action_param,
            on_sections_source=on_sections_source,
        )

        if (
            isinstance(result, dict)
            and result.get("type") == "ir_actions_account_report_download"
            and result.get("data", {}).get("file_generator") == "export_to_pdf"
        ):
            result["direct_print_enabled"] = (
                self.env["ir.actions.report"].is_direct_print_enabled()
            )
            printer = self.env["printer.configuration"].sudo().get_default_printer()
            if printer:
                result["default_printer"] = printer

        return result
