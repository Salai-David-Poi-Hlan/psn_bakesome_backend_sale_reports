from odoo import api, models
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class SaleReport(models.Model):
    _inherit = "sale.report"

    @api.model
    def get_utc_date_bounds(self, date_from, date_to):
        
        company = self.env.company
        tz_name = company.partner_id.tz or 'UTC'
        try:
            local_tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            local_tz = ZoneInfo('UTC')

        start_naive = datetime.combine(
            datetime.strptime(date_from, '%Y-%m-%d').date(), time.min
        )
        end_naive = datetime.combine(
            datetime.strptime(date_to, '%Y-%m-%d').date(), time.min
        ) + timedelta(days=1)

        start_utc = start_naive.replace(tzinfo=local_tz).astimezone(timezone.utc)
        end_utc = end_naive.replace(tzinfo=local_tz).astimezone(timezone.utc)

        return {
            'date_from': start_utc.strftime('%Y-%m-%d %H:%M:%S'),
            'date_to': end_utc.strftime('%Y-%m-%d %H:%M:%S'),
        }