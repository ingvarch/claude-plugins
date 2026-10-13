import tiktoken, zlib, base64, json
enc = tiktoken.get_encoding("o200k_base")
n = lambda s: len(enc.encode(s))
brn = open("bench/equiv.brn").read()
rows = []
rows.append(("brn (as is)", brn))
rows.append(("brn, zlib+base64", base64.b64encode(zlib.compress(brn.encode(), 9)).decode()))
rows.append(("brn, hex", brn.encode().hex()))
# "near-binary": single-letter codes, no spaces, abbreviations
cod = brn.replace(" :: ", "|").replace(" -> ", ">").replace("because","b").replace(" #", "#").replace(", ", ",")
rows.append(("brn, squeezed punctuation", cod))
# one-token-per-field: CJK (each char ~1-2 tok, but dense info?) - try a chinese gloss of one line
line = ".3 AE verifies JWT RS256, pubkey @s/auth/keys.go:14 #api"
rows.append(("1 line en", line))
rows.append(("1 line ru", ".3 AE проверяет JWT RS256, pubkey @s/auth/keys.go:14 #api"))
rows.append(("1 line zh", ".3 AE验证JWT RS256，公钥@s/auth/keys.go:14 #api"))
rows.append(("1 line emoji sigils", "🧱3 AE verifies JWT RS256, pubkey 📁s/auth/keys.go:14 🏷api"))
rows.append(("1 line codes", "F3|AE|JWT RS256|s/auth/keys.go:14|api"))
for name, s in rows:
    print(f"{name:28} {n(s):5} tok  {len(s):5} chars  {len(s)/max(n(s),1):.2f} chars/tok")
