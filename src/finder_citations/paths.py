import os

_PREFIXES_ENV = "PREFIXES_CSV"


def resolve_prefixes_path() -> str:
    candidates = []
    env_path = os.environ.get(_PREFIXES_ENV)
    if env_path:
        candidates.append(env_path)
    candidates.append(os.path.join(os.getcwd(), "input_data", "prefixes.csv"))
    package_dir = os.path.dirname(os.path.abspath(__file__))
    src_root = os.path.dirname(package_dir)
    repo_root = os.path.dirname(src_root)
    candidates.append(os.path.join(repo_root, "input_data", "prefixes.csv"))
    candidates.append(os.path.join(package_dir, "input_data", "prefixes.csv"))
    for path in candidates:
        if path and os.path.isfile(path):
            return os.path.normpath(path)
    return os.path.normpath(candidates[1] if not env_path else candidates[0])
