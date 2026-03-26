"""
This snippet is intentionally misleading for regex-based “quick scan”:
the quick analyzer may detect the “def fake” pattern even though it's inside a string.
"""

"""
def fake(x):
    return x * 2
"""

def real(y):
    return y + 1

