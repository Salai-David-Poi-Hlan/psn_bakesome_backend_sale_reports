from odoo import models


class ShopeeOrder(models.Model):
    _inherit="shopee.order"

    def _prepare_sale_order_vals(self,partner):
        self.ensure_one()
        vals=super()._prepare_sale_order_vals(partner)
        vals.update({
            "shopee_order_id":self.id
        })
        return vals