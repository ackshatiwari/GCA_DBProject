import requests
import json
import urllib.parse
from bs4 import BeautifulSoup

from pathlib import Path

# Get the directory of the currently running script
current_dir = Path(__file__).parent
file_path = current_dir / "web_scrape_output.html"

site_id = "10994"

query = {
    "filters": [
        {
            "name": "site_id",
            "op": "eq",
            "val": site_id
        },
        {
            "or": [
                {
                    "name": "has_been_deleted",
                    "op": "neq",
                    "val": "true"
                },
                {
                    "name": "has_been_deleted",
                    "op": "is_null"
                }
            ]
        },
        {
            "or": [
                {
                    "name": "has_been_archived",
                    "op": "neq",
                    "val": "true"
                },
                {
                    "name": "has_been_archived",
                    "op": "is_null"
                }
            ]
        }
    ],
    "order_by": [
        {
            "field": "survey_date",
            "direction": "desc"
        }
    ]
}

encoded_query = urllib.parse.quote(json.dumps(query))

url = f"https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom?q={encoded_query}&results_per_page=200"

print(url)

response = requests.get(url)
data = response.json()
soup = BeautifulSoup(response.text, 'html.parser')
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(soup.prettify())

