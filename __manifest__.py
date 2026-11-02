{
    'name': 'Bakesome  backend Sale Analytic Reports',
    'version': '18.0.1.0.1',
    'summary': 'Bakesome  backend Sale Analytic Reports',
    'description': '''
Bakesome  backend Sale Analytic Reports
    ''',
    'author': 'Bakesome',
    'category': 'PSN/PSN',
    'depends': [
             'sale',
            'sale_management',
            'website_sale',
            'point_of_sale',
            'pos_sale',
            'onebiz_line_oa_order',
            'purchase',
            'onebiz_shopee'
    ],
    'data': [
        ''
             'views/sale_channel_dashboard_menu.xml'
    ],

      'assets': {
            'web.assets_backend': [
                'psn_bakesome_backend_sale_reports/static/src/js/**/*.js',
                'psn_bakesome_backend_sale_reports/static/src/xml/**/*.xml',
                'psn_bakesome_backend_sale_reports/static/src/scss/**/*.scss',
            ],
        },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
