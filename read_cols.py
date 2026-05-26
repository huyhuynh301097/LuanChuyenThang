import pandas as pd
url = "https://docs.google.com/spreadsheets/d/1Yaf-aMKXxZIrkFCI9RgN6cMNJaaW1PZ0e8up4Dv8Yx8/export?format=csv&gid=623910036"
df = pd.read_csv(url, nrows=5)
print("COLUMNS:")
print(df.columns.tolist())
print("\nSAMPLE ROW:")
print(df.iloc[0].to_dict())
