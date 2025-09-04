#!/usr/bin/env python3
"""
Generate exchange rate sensors configuration for KDF HADEX addon
This script creates the appropriate sensor configuration based on user settings
"""

import os
import sys
import yaml
import json
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [kdf-exchange] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

def load_config():
    """Load configuration from /data/options.json (authoritative)."""
    options_file = '/data/options.json'
    try:
        if os.path.exists(options_file):
            with open(options_file, 'r') as f:
                data = json.load(f)
                return {
                    'enable_exchange_rates': bool(data.get('enable_exchange_rates', False)),
                    'exchange_rates_api_key': data.get('exchange_rates_api_key', ''),
                    'selected_fiat_currency': data.get('selected_fiat_currency', 'AUD')
                }
    except Exception as e:
        logger.warning(f"Failed to load {options_file}: {e}")
    return {
        'enable_exchange_rates': 'false',
        'exchange_rates_api_key': '',
        'selected_fiat_currency': ''
    }

def generate_exchange_sensors_config(config):
    """Generate the exchange rate sensors configuration"""
    
    if not config['enable_exchange_rates']:
        logger.info("Exchange rates disabled, skipping sensor generation")
        return None
    
    if not config['exchange_rates_api_key']:
        logger.warning("Exchange rates enabled but no API key provided")
        return None
    
    selected_currency = config['selected_fiat_currency']
    
    # Currency icons mapping
    currency_icons = {
        'AUD': 'mdi:cash-multiple',
        'EUR': 'mdi:currency-eur',
        'GBP': 'mdi:currency-gbp',
        'JPY': 'mdi:currency-jpy',
        'CAD': 'mdi:currency-cad',
        'CHF': 'mdi:currency-chf',
        'CNY': 'mdi:currency-cny',
        'NZD': 'mdi:currency-nzd',
        'SGD': 'mdi:currency-sgd',
        'HKD': 'mdi:currency-hkd',
        'KRW': 'mdi:currency-krw',
        'INR': 'mdi:currency-inr',
        'BRL': 'mdi:currency-brl',
        'MXN': 'mdi:currency-mxn',
        'RUB': 'mdi:currency-rub',
        'ZAR': 'mdi:currency-zar',
        'TRY': 'mdi:currency-try',
        'SEK': 'mdi:currency-sek',
        'NOK': 'mdi:currency-nok',
        'DKK': 'mdi:currency-dkk',
        'PLN': 'mdi:currency-pln',
        'CZK': 'mdi:currency-czk',
        'HUF': 'mdi:currency-huf'
    }
    
    # Currency precision mapping
    currency_precision = {
        'JPY': 2,
        'KRW': 0,
        'INR': 2,
        'HUF': 2,
        'CNY': 4,
        'HKD': 4,
        'BRL': 4,
        'MXN': 4,
        'RUB': 4,
        'ZAR': 4,
        'TRY': 4,
        'SEK': 4,
        'NOK': 4,
        'DKK': 4,
        'PLN': 4,
        'CZK': 4,
        'AUD': 6,
        'EUR': 6,
        'GBP': 6,
        'CAD': 6,
        'CHF': 6,
        'NZD': 6,
        'SGD': 6
    }
    
    # Generate the main exchange rates sensor configuration
    main_sensor_config = {
        'resource': 'https://openexchangerates.org/api/latest.json',
        'method': 'GET',
        'params': {
            'app_id': config['exchange_rates_api_key']
        },
        'scan_interval': 7200,  # 2 hours
        'timeout': 15,
        'headers': {
            'Accept': 'application/json'
        },
        'sensor': [{
            'name': 'Exchange Rates',
            'unique_id': 'hadex_exchange_rates',
            'icon': 'mdi:cash-multiple',
            'unit_of_measurement': 'USD',
            'state_class': 'measurement',
            'value_template': f'''{{% if value_json.rates is defined and value_json.rates.{selected_currency} is defined %}}
  {{ (1 / value_json.rates.{selected_currency}) | round(6) }}
{{% else %}}
  {{ 1.5 }}
{{% endif %}}''',
            'json_attributes': ['rates', 'base', 'timestamp', 'disclaimer', 'license']
        }]
    }
    
    # Generate template sensors for all currencies
    template_sensors = []
    
    for currency in currency_icons.keys():
        precision = currency_precision.get(currency, 6)
        icon = currency_icons[currency]
        
        # Build the state template string
        state_template = f"{{{{% set rates = state_attr('sensor.hadex_exchange_rates','rates') | default({{}}, true) %}}}}\n{{{{ rates.get('{currency}', 0) | float(0) | round({precision}) }}}}"
        
        sensor_config = {
            'name': f'USD→{currency} rate',
            'unique_id': f'hadex_usd_{currency.lower()}_rate',
            'icon': icon,
            'unit_of_measurement': currency,
            'state_class': 'measurement',
            'availability': f"{{{{ state_attr('sensor.hadex_exchange_rates','rates') is mapping and state_attr('sensor.hadex_exchange_rates','rates').{currency} is defined }}}}",
            'state': state_template
        }
        template_sensors.append(sensor_config)
    
    # Combine all configurations
    full_config = [main_sensor_config]
    
    if template_sensors:
        full_config.append({
            'sensor': template_sensors
        })
    
    return full_config

def write_config_file(config, output_path):
    """Write the configuration to a YAML file"""
    try:
        with open(output_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)
        logger.info(f"Exchange rate sensors configuration written to {output_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to write configuration file: {e}")
        return False

def main():
    """Main function"""
    logger.info("Generating exchange rate sensors configuration...")
    
    # Load configuration
    config = load_config()
    logger.info(f"Configuration loaded: enable={config['enable_exchange_rates']}, currency={config['selected_fiat_currency']}")
    
    # Generate sensor configuration
    sensor_config = generate_exchange_sensors_config(config)
    
    if sensor_config is None:
        logger.info("No exchange rate sensors to generate")
        return 0
    
    # Write configuration file
    output_path = '/usr/local/bin/exchange-rates-sensors.yaml'
    if write_config_file(sensor_config, output_path):
        logger.info("Exchange rate sensors configuration generated successfully")
        return 0
    else:
        logger.error("Failed to generate exchange rate sensors configuration")
        return 1

if __name__ == "__main__":
    sys.exit(main())
