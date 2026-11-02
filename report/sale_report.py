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

    # Untaxed discount on the same basis as price_subtotal, so
    # price_subtotal + psn_discount_amount = sales before discount.
    # The stock discount_amount (price_unit * qty * discount%) is tax-included
    # and overstated on pack-priced lines (price_unit per pack, qty in units).
    psn_discount_amount = fields.Float(string='Discount (Untaxed)', readonly=True)

    def _psn_discount_sql(self, line_discount_product_ids):
        """Per-line untaxed discount: the line % discount plus loyalty reward /
        discount-product lines (negative lines, so their amount is subtracted).

        100%-discount lines count as 0: their subtotal is 0 and they are free
        gifts, not a markdown of a sold item.
        """
        reward_cond = "(l.reward_id IS NOT NULL AND t.type = 'service')"
        if line_discount_product_ids:
            reward_cond = "(%s OR l.product_id IN (%s))" % (
                reward_cond, ','.join(str(int(i)) for i in line_discount_product_ids))
        return """
                (CASE WHEN l.discount > 0 AND l.discount < 100
                      THEN l.price_subtotal * l.discount / (100.0 - l.discount)
                      ELSE 0 END)
                - (CASE WHEN %s THEN l.price_subtotal ELSE 0 END)""" % reward_cond

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
        discount_products = self.env['res.company'].sudo().search([]).sale_discount_product_id.ids
        res['psn_discount_amount'] = """
            CASE WHEN l.product_id IS NOT NULL THEN SUM((%s)
                / CASE COALESCE(s.currency_rate, 0) WHEN 0 THEN 1.0 ELSE s.currency_rate END
                * CASE COALESCE(account_currency_table.rate, 0) WHEN 0 THEN 1.0 ELSE account_currency_table.rate END
            ) ELSE 0 END""" % self._psn_discount_sql(discount_products)
        return res

    def _group_by_sale(self):
        res = super()._group_by_sale()
        res += """,
            s.line_oa_order_id,
            s.is_line_oa_order,
            s.shopee_order_id,
            s.is_shopee_order"""
        return res
