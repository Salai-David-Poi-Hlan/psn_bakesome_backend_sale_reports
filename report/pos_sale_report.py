# -*- coding: utf-8 -*-
from odoo import models


class SaleReport(models.Model):
    _inherit = 'sale.report'

    def _available_additional_pos_fields(self):
        res = super()._available_additional_pos_fields()
        res['branch_id'] = 'config.branch_id'
        res['channel_type'] = "'pos'"
        return res

    def _group_by_pos(self):
        res = super()._group_by_pos()
        res += """,
            config.branch_id"""
        return res
