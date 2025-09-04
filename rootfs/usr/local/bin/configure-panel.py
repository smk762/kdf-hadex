#!/usr/bin/env python3
"""
Configure KDF panel based on show_in_sidebar setting
"""

import os
import json
import sys

def configure_panel():
    """Configure the panel based on user settings"""
    try:
        # Read add-on options
        options_path = '/data/options.json'
        if not os.path.exists(options_path):
            print("No options.json found, using defaults")
            return
        
        with open(options_path, 'r') as f:
            options = json.load(f)
        
        show_in_sidebar = options.get('show_in_sidebar', True)
        panel_icon = options.get('panel_icon', 'mdi:chart-line')
        panel_title = options.get('panel_title', 'KDF Trading')
        panel_admin = options.get('panel_admin', False)
        
        print(f"Panel configuration: show_in_sidebar={show_in_sidebar}")
        
        if show_in_sidebar:
            # Create panel configuration
            panel_config = {
                'panel_icon': panel_icon,
                'panel_title': panel_title,
                'panel_admin': panel_admin
            }
            
            # Write panel configuration to a file that can be read by the add-on
            config_path = '/data/panel_config.json'
            with open(config_path, 'w') as f:
                json.dump(panel_config, f)
            
            print(f"Panel configured: {panel_title} with icon {panel_icon}")
        else:
            # Remove panel configuration
            config_path = '/data/panel_config.json'
            if os.path.exists(config_path):
                os.remove(config_path)
            print("Panel configuration removed")
            
    except Exception as e:
        print(f"Error configuring panel: {e}")
        sys.exit(1)

if __name__ == "__main__":
    configure_panel()
