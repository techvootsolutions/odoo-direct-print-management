# -*- coding: utf-8 -*-
# Powered by Techvoot Solutions.
# © 2018 Techvoot Solutions. (<https://www.techvoot.com/>).
# See LICENSE file for full copyright & licensing details.

{
    'name': 'Direct Print Management',
    'version': '19.0.1.0.0',
    'category': 'Productivity',
    'summary': 'Browser-style print preview for QWeb and accounting PDF reports',
    'description': """
Direct Print Management
=======================

Replaces the default PDF download behavior with a browser-style print workflow:

* Intercepts all standard QWeb PDF report actions globally
* Intercepts accounting report PDF exports (Balance Sheet, P&L, etc.)
* Opens a print preview dialog with the actual generated PDF
* Automatically triggers the browser print dialog (Ctrl+P style)
* Provides Print, Download PDF, and Close actions
* Allows per-user and per-company default printer configuration
    """,
    'author': "Techvoot Solutions",
    'website': "https://www.techvoot.com",
    'depends': ['web', 'account_reports'],
    'data': [
        'security/direct_print_security.xml',
        'security/ir.model.access.csv',
        'views/printer_configuration_views.xml',
        'views/res_config_settings_views.xml',
        'views/menu_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'OPL-1',
    'images': ['static/description/banner.gif'],
    'assets': {
        'web.assets_backend': [
            'tv_direct_print_management/static/src/**/*',
        ],
    },
}
