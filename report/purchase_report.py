from odoo import models, fields, api
from odoo.tools.sql import SQL


class PurchaseReport(models.Model):
    _inherit = "purchase.report"

    discount = fields.Float(string="Discount %", readonly=True, aggregator="avg")
    discount_amount = fields.Monetary(string="Discount Amount", readonly=True)
    # Untaxed, so untaxed_total + psn_discount_amount = purchases before discount
    # (discount_amount above uses price_unit, which is tax-included on some lines).
    psn_discount_amount = fields.Float(string="Discount (Untaxed)", readonly=True)

    def _case_value_or_one(self, value: SQL) -> SQL:
        return SQL(
            "CASE COALESCE(%(value)s, 0) WHEN 0 THEN 1.0 ELSE %(value)s END",
            value=value,
        )

    def _select(self) -> SQL:
        res = super()._select()
        return SQL(
            """%s,
            AVG(l.discount) AS discount,
            CASE WHEN l.product_id IS NOT NULL THEN
                SUM(l.price_unit * l.product_qty * l.discount) / 100.0
                / %s
                * %s
            ELSE 0 END AS discount_amount,
            CASE WHEN l.product_id IS NOT NULL THEN
                SUM(CASE WHEN l.discount > 0 AND l.discount < 100
                         THEN l.price_subtotal * l.discount / (100.0 - l.discount)
                         ELSE 0 END)
                / %s
                * %s
            ELSE 0 END AS psn_discount_amount
            """,
            res,
            self._case_value_or_one(SQL("po.currency_rate")),
            self._case_value_or_one(SQL("account_currency_table.rate")),
            self._case_value_or_one(SQL("po.currency_rate")),
            self._case_value_or_one(SQL("account_currency_table.rate")),
        )