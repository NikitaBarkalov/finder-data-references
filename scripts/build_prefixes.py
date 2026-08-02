import asyncio
import os
import re

import aiohttp
import numpy as np
import pandas as pd
import requests
from tqdm import tqdm

tqdm.pandas()


def get_type_by_request(prefix):
    url = f"https://hdl.handle.net/api/handles/{prefix}"
    response = requests.get(url)
    try:
        data = response.json()
        for val in data["values"]:
            if val["type"] == "HS_SERV":
                return val["data"]["value"]
        return np.nan
    except Exception:
        return np.nan


async def fetch(session, url):
    async with session.get(url) as resp:
        return await resp.json()


async def main_fetch(urls):
    connector = aiohttp.TCPConnector(limit=100)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [fetch(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return results


def build_prefixes(output_path="prefixes.csv"):
    print("Initializing prefix list...")
    prefixes = [f"10.{i}" for i in range(0, 100000)]
    all_prefixes = pd.DataFrame({"prefix": prefixes})
    urls = [f"https://hdl.handle.net/api/handles/10.{i}" for i in range(0, 100000)]
    print("Fetching data from Handle.Net API...")
    data = asyncio.run(main_fetch(urls))
    print("Parsing types...")
    result = []
    for json_data in tqdm(data):
        if isinstance(json_data, Exception) or not isinstance(json_data, dict):
            result.append(np.nan)
            continue
        try:
            type_cit = ""
            values = json_data.get("values", []) if isinstance(json_data, dict) else []
            for val in values:
                if val["type"] == "HS_SERV":
                    type_cit += val["data"]["value"]
            if len(type_cit) == 0:
                type_cit = np.nan
            result.append(type_cit)
        except Exception:
            result.append(np.nan)
    print("Parsing descriptions...")
    descr = []
    for json_data in tqdm(data):
        if isinstance(json_data, Exception) or not isinstance(json_data, dict):
            descr.append(np.nan)
            continue
        try:
            desc = ""
            values = json_data.get("values", []) if isinstance(json_data, dict) else []
            for val in values:
                if val["type"] == "DESC":
                    desc += val["data"]["value"]
            if len(desc) == 0:
                desc = np.nan
            descr.append(desc)
        except Exception:
            descr.append(np.nan)
    all_prefixes["type"] = result
    all_prefixes["description"] = descr
    all_prefixes.dropna(subset=["type"], inplace=True)
    unknown = all_prefixes[
        all_prefixes["description"].progress_apply(
            lambda info: (
                re.search(re.compile("data\\s*cite", re.IGNORECASE), info) is not None if type(info) is str else False
            )
        )
    ]
    unknown = unknown[unknown["type"] != "10.SERV/DATACITE"]
    all_prefixes.loc[unknown.index, ["type"]] = "10.SERV/MIXED"
    print(f"Saving to {output_path}...")
    all_prefixes.drop(columns=["description"]).to_csv(output_path, index=False)
    print("Done!")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_dir = os.path.join(project_root, "input_data")
    os.makedirs(output_dir, exist_ok=True)
    output_csv = os.path.join(output_dir, "prefixes.csv")
    build_prefixes(output_path=output_csv)
