# Exchange Rate Integration for KDF HADEX

This addon now includes optional exchange rate sensors that provide real-time currency conversion rates from the OpenExchangeRates API.

## Features

- **Real-time Exchange Rates**: Get current USD exchange rates for 23 major currencies
- **Configurable Primary Currency**: Choose your preferred fiat currency for the main exchange rate sensor
- **Individual Currency Sensors**: Access individual USD→Currency rate sensors for all supported currencies
- **Automatic Updates**: Exchange rates are updated every 2 hours to respect API rate limits
- **Home Assistant Integration**: All sensors are automatically created in Home Assistant
- **Unique Sensor IDs**: All sensors use the `hadex_` prefix to avoid conflicts with existing sensors

## Supported Currencies

The following currencies are supported:

- **AUD** - Australian Dollar
- **EUR** - Euro
- **GBP** - British Pound Sterling
- **JPY** - Japanese Yen
- **CAD** - Canadian Dollar
- **CHF** - Swiss Franc
- **CNY** - Chinese Yuan
- **NZD** - New Zealand Dollar
- **SGD** - Singapore Dollar
- **HKD** - Hong Kong Dollar
- **KRW** - South Korean Won
- **INR** - Indian Rupee
- **BRL** - Brazilian Real
- **MXN** - Mexican Peso
- **RUB** - Russian Ruble
- **ZAR** - South African Rand
- **TRY** - Turkish Lira
- **SEK** - Swedish Krona
- **NOK** - Norwegian Krone
- **DKK** - Danish Krone
- **PLN** - Polish Złoty
- **CZK** - Czech Koruna
- **HUF** - Hungarian Forint

## Configuration

### 1. Enable Exchange Rates

In the addon configuration, set:
```yaml
enable_exchange_rates: true
```

### 2. Get an API Key

1. Visit [OpenExchangeRates.org](https://openexchangerates.org/)
2. Sign up for a free account
3. Get your API key from the dashboard

### 3. Configure API Key

Enter your API key directly in the addon configuration:
```yaml
exchange_rates_api_key: "your_api_key_here"
```

The API key is stored securely in the addon configuration and embedded directly in the sensor configuration.

### 4. Select Primary Currency

Choose your preferred currency from the dropdown:
```yaml
selected_fiat_currency: "AUD"  # or any other supported currency
```

### 5. Restart Required

**Important**: After making any changes to the exchange rate configuration, you must restart the addon for the changes to take effect. The addon will detect configuration changes and prompt you to restart.

### Configuration Validation

The addon will only create exchange rate sensors if:
- `enable_exchange_rates` is set to `true`
- A valid API key is configured in the addon configuration
- The API key is not empty or set to "CHANGE_ME"

If any of these conditions are not met, the sensors will not be created and any existing sensors will be removed.

## Generated Sensors

When enabled, the addon creates the following sensors in Home Assistant:

### Main Exchange Rate Sensor
- **sensor.hadex_exchange_rates**: Main sensor showing the inverse rate of your selected currency (e.g., if AUD is selected, shows how many USD you get for 1 AUD)

### Individual Currency Sensors
- **sensor.hadex_usd_aud_rate**: USD to AUD conversion rate
- **sensor.hadex_usd_eur_rate**: USD to EUR conversion rate
- **sensor.hadex_usd_gbp_rate**: USD to GBP conversion rate
- **sensor.hadex_usd_jpy_rate**: USD to JPY conversion rate
- **sensor.hadex_usd_cad_rate**: USD to CAD conversion rate
- **sensor.hadex_usd_chf_rate**: USD to CHF conversion rate
- **sensor.hadex_usd_cny_rate**: USD to CNY conversion rate
- **sensor.hadex_usd_nzd_rate**: USD to NZD conversion rate
- **sensor.hadex_usd_sgd_rate**: USD to SGD conversion rate
- **sensor.hadex_usd_hkd_rate**: USD to HKD conversion rate
- **sensor.hadex_usd_krw_rate**: USD to KRW conversion rate
- **sensor.hadex_usd_inr_rate**: USD to INR conversion rate
- **sensor.hadex_usd_brl_rate**: USD to BRL conversion rate
- **sensor.hadex_usd_mxn_rate**: USD to MXN conversion rate
- **sensor.hadex_usd_rub_rate**: USD to RUB conversion rate
- **sensor.hadex_usd_zar_rate**: USD to ZAR conversion rate
- **sensor.hadex_usd_try_rate**: USD to TRY conversion rate
- **sensor.hadex_usd_sek_rate**: USD to SEK conversion rate
- **sensor.hadex_usd_nok_rate**: USD to NOK conversion rate
- **sensor.hadex_usd_dkk_rate**: USD to DKK conversion rate
- **sensor.hadex_usd_pln_rate**: USD to PLN conversion rate
- **sensor.hadex_usd_czk_rate**: USD to CZK conversion rate
- **sensor.hadex_usd_huf_rate**: USD to HUF conversion rate

## Usage in Home Assistant

### In Automations
```yaml
automation:
  - alias: "Currency Alert"
    trigger:
      - platform: numeric_state
        entity_id: sensor.hadex_usd_aud_rate
        above: 1.5
    action:
      - service: notify.mobile_app_your_phone
        data:
          message: "USD/AUD rate is above 1.5!"
```

### In Templates
```yaml
template:
  - sensor:
      - name: "My Crypto Value in AUD"
        unit_of_measurement: "AUD"
        state: >
          {{ (states('sensor.my_crypto_balance') | float * states('sensor.hadex_usd_aud_rate') | float) | round(2) }}
```

### In Dashboards
The sensors can be used in any Home Assistant dashboard card that supports numeric sensors, such as:
- Gauge cards
- Stat cards
- History graphs
- Custom cards

## API Rate Limits

The free OpenExchangeRates API has the following limits:
- 1,000 requests per month
- Updates every 2 hours (1,200 requests per month)

The addon is configured to update every 2 hours to stay within these limits.

## Troubleshooting

### Sensors Not Appearing
1. Check that `enable_exchange_rates` is set to `true`
2. Verify your API key is correctly configured in the addon configuration
3. Ensure the API key is not empty or set to "CHANGE_ME"
4. Check the addon logs for any error messages
5. **Restart the addon** after making configuration changes
6. Check that Home Assistant has been restarted (it should restart automatically)

### API Key Issues
1. Verify your API key is valid at [OpenExchangeRates.org](https://openexchangerates.org/)
2. Check that you haven't exceeded your monthly request limit
3. Ensure the API key is properly configured in the addon configuration
4. Make sure the API key is not set to "CHANGE_ME" or empty

### Configuration Changes Not Taking Effect
1. **Restart the addon** after making any configuration changes
2. The addon will detect configuration changes and prompt you to restart
3. Check the addon logs for configuration change notifications

### Sensors Not Being Removed
1. If you disable exchange rates, the sensors should be automatically removed
2. If sensors persist, restart the addon
3. Check that the cleanup process completed successfully in the logs

### Currency Not Available
If you need a currency that's not in the supported list, you can:
1. Request it to be added to the addon
2. Use the raw `sensor.hadex_exchange_rates` sensor and access the `rates` attribute for any currency

## Technical Details

- **Update Frequency**: Every 2 hours (7200 seconds)
- **API Endpoint**: `https://openexchangerates.org/api/latest.json`
- **Data Format**: JSON with rates object containing currency pairs
- **Precision**: Varies by currency (2-6 decimal places based on typical exchange rate precision)
- **Sensor ID Prefix**: All sensors use `hadex_` prefix to avoid conflicts

## Operational & Best Practices

These operational rules follow best practices for optional services and make the addon behaviour predictable and visible to users and supervisors:

- **Check configuration only at launch**: The exchange-rate service validates `enable_exchange_rates` and the API key during addon startup. If exchange rates are disabled at launch the service exits cleanly and does not run in the background.
- **Fail fast on misconfiguration**: If `enable_exchange_rates` is enabled but a valid `exchange_rates_api_key` is missing or invalid at startup, the service fails to start with a clear error and an actionable message. This surfaces the problem in the Supervisor UI and avoids silently hiding errors.
- **Do not sleep indefinitely for errors**: The addon will not silently sleep forever on misconfiguration. Instead it exits with a non-zero status so the Supervisor/addon UI shows a clear failure state.
- **Restart required for config changes**: Changes to the exchange-rate configuration (toggle or API key) require a restart of the addon to take effect. The addon will detect configuration changes at startup and prompt the user to restart.
- **Link to API provider for missing keys**: If a user enables exchange rates without an API key, the error message links to the provider to obtain a key: https://openexchangerates.org
- **Caching and update cadence**: To reduce load and avoid stale requests the addon caches non-critical data (enabled coins, peers, orders summary) for 60s and active swaps for 30s (15s when swaps are in progress). The main exchange rate REST sensor queries the upstream API on a conservative 2-hour cadence to respect rate limits.

These patterns improve observability, avoid restart churn, and make it clear when administrative action is required.

## Security Notes

- API keys are stored securely in the addon configuration
- The addon uses HTTPS for all API communications
- No exchange rate data is logged or stored permanently
- API keys are not exposed in logs or configuration files
- The API key is embedded directly in the sensor configuration for Home Assistant