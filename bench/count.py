import tiktoken, sys, pathlib
enc = tiktoken.get_encoding("o200k_base")
for f in sys.argv[1:]:
    t = pathlib.Path(f).read_text()
    print(f"{pathlib.Path(f).name:12} {len(enc.encode(t)):5} tok  {len(t):5} chars")
