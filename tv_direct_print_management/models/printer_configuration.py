# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class PrinterConfiguration(models.Model):
    _name = 'printer.configuration'
    _description = 'Printer Configuration'
    _order = 'company_id, user_id, name'

    name = fields.Char(string='Name', required=True)
    printer_name = fields.Char(
        string='Printer Name',
        required=True,
        help="Name of the printer as it appears in the operating system or browser print dialog.",
    )
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )
    user_id = fields.Many2one(
        'res.users',
        string='User',
        help="Leave empty for a company-wide default printer.",
    )
    is_default = fields.Boolean(string='Default Printer')

    @api.constrains('is_default', 'active', 'company_id', 'user_id')
    def _check_single_default(self):
        for record in self.filtered(lambda r: r.is_default and r.active):
            domain = [
                ('id', '!=', record.id),
                ('is_default', '=', True),
                ('active', '=', True),
                ('company_id', '=', record.company_id.id),
                ('user_id', '=', record.user_id.id),
            ]
            if self.search_count(domain):
                raise ValidationError(_(
                    "Only one default printer is allowed per user and company."
                ))

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.filtered('is_default')._unset_other_defaults()
        return records

    def write(self, vals):
        res = super().write(vals)
        if vals.get('is_default'):
            self.filtered('is_default')._unset_other_defaults()
        return res

    def _unset_other_defaults(self):
        for record in self:
            domain = [
                ('id', '!=', record.id),
                ('is_default', '=', True),
                ('company_id', '=', record.company_id.id),
                ('user_id', '=', record.user_id.id),
            ]
            self.search(domain).write({'is_default': False})

    @api.model
    def get_default_printer(self):
        """Return the default printer for the current user and company."""
        user = self.env.user
        company = self.env.company
        base_domain = [
            ('active', '=', True),
            ('is_default', '=', True),
            ('company_id', '=', company.id),
        ]
        printer = self.search(base_domain + [('user_id', '=', user.id)], limit=1)
        if not printer:
            printer = self.search(base_domain + [('user_id', '=', False)], limit=1)
        if not printer:
            return False
        return {
            'id': printer.id,
            'name': printer.name,
            'printer_name': printer.printer_name,
        }
