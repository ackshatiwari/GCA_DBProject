import requests
from bs4 import BeautifulSoup


res = requests.get('https://api.cleanwaterhub.org/v1/data/protocol_vasos_rocky_bottom/13534')
if res.status_code == 200:
    data = res.json()
    soup = BeautifulSoup(res.text, 'html.parser')
    print(soup.prettify())
else:
    print(f"Failed to fetch data: {res.status_code}")