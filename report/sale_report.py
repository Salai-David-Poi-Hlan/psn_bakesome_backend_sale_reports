# -*- coding: utf-8 -*-
from odoo import fields, models


class SaleReport(models.Model):
    _inherit = 'sale.report'

    line_oa_order_id = fields.Many2one('line.oa.order', readonly=True)
    is_line_oa_order = fields.Boolean(readonly=True)

    channel_type = fields.Selection([
        ('backend', 'Backend Sale'),
        ('website', 'Website'),
        ('pos', 'POS'),
        ('line_oa', 'Line OA'),
        ('shopee', 'Shopee')
    ], string='Sales Channel', readonly=True)

    def _select_additional_fields(self):
        res = super()._select_additional_fields()
        res['line_oa_order_id'] = "s.line_oa_order_id"
        res['is_line_oa_order'] = "s.is_line_oa_order"
        res["shopee_order_id"]="s.shopee_order_id"
        res["is_shopee_order"]="s.is_shopee_order"
        res['channel_type'] = """
            CASE
                WHEN s.is_line_oa_order THEN 'line_oa'
                WHEN s.is_shopee_order THEN 'shopee'
                WHEN s.website_id IS NOT NULL THEN 'website'
                ELSE 'backend'
            END"""
        return res

    def _group_by_sale(self):
        res = super()._group_by_sale()
        res += """,
            s.line_oa_order_id,
            s.is_line_oa_order,
            s.shopee_order_id,
            s.is_shopee_order"""
        return res
