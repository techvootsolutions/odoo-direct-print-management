# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    direct_print_enabled = fields.Boolean(
        string='Direct Print Preview',
        config_parameter='tv_direct_print_management.enabled',
        default=False,
        help="When enabled, PDF reports open in a print preview dialog instead of downloading directly.",
    )

    def set_values(self):
        super().set_values()

        group = self.env.ref(
            'tv_direct_print_management.group_pdf_preview'
        )

        user_group = self.env.ref('base.group_user')

        if self.direct_print_enabled:
            user_group.implied_ids = [(4, group.id)]
        else:
            user_group.implied_ids = [(3, group.id)]
