# -*- coding: utf-8 -*-
from odoo import models


class SaleReport(models.Model):
    _inherit = 'sale.report'

    def _available_additional_pos_fields(self):
        res = super()._available_additional_pos_fields()
        res['branch_id'] = 'config.branch_id'
        res['channel_type'] = "'pos'"
        res['psn_discount_amount'] = """
            SUM(%s)
                / MIN(CASE COALESCE(pos.currency_rate, 0) WHEN 0 THEN 1.0 ELSE pos.currency_rate END)
                * CASE COALESCE(account_currency_table.rate, 0) WHEN 0 THEN 1.0 ELSE account_currency_table.rate END""" % (
            self._psn_discount_sql([]))
        return res

    def _group_by_pos(self):
        res = super()._group_by_pos()
        res += """,
            config.branch_id"""
        return res
