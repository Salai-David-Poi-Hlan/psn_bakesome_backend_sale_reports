from odoo import models, fields, api



class SaleOrder(models.Model):
    _inherit="sale.order"

    shopee_order_id=fields.Many2one("shopee.order",string="Shopee Order",readonly=True,copy=False)

    is_shopee_order=fields.Boolean("Is Shopee Order",compute="_compute_is_shopee_order",store=True)


    @api.depends('shopee_order_id')
    def _compute_is_shopee_order(self):
        for order in self:
            order.is_shopee_order=bool(order.shopee_order_id)