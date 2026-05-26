import pandas as pd
import numpy as np

# Direct Google Sheets CSV export link for 'luan_chuyen_thang' sheet
URL_LUAN_CHUYEN = "https://docs.google.com/spreadsheets/d/1Yaf-aMKXxZIrkFCI9RgN6cMNJaaW1PZ0e8up4Dv8Yx8/export?format=csv&gid=623910036"

print("Step 1: Fetching 'luan_chuyen_thang' from Google Sheets...")
try:
    df = pd.read_csv(URL_LUAN_CHUYEN)
    print(f"Data loaded successfully. Shape: {df.shape}")
except Exception as e:
    print(f"Error loading from Google Sheets: {e}")
    exit(1)

# Clean up index/unnamed columns that Google Sheets / Pandas CSV export might add
def clean_dataframe(df):
    # Drop any columns named 'Unnamed: 0' or empty string
    columns_to_drop = [col for col in df.columns if col.startswith('Unnamed:') or col == '']
    if columns_to_drop:
        df = df.drop(columns=columns_to_drop)
    return df

df = clean_dataframe(df)

# Fill standard NaN values
print("Step 2: Processing and cleaning data...")
if 'pct_rot_lc' in df.columns:
    df['pct_rot_lc'] = df['pct_rot_lc'].fillna(0.0)

# Fill other necessary numeric metrics
numeric_cols = ['vol', 'kl', 'vol_tb_ngay', 'kl_tb_ngay', 'pct_opr', 'pct_odr', 'pct_longtail']
for col in numeric_cols:
    if col in df.columns:
        df[col] = df[col].fillna(0.0)

print("\n--- Data Verification ---")
print("Total rows loaded:", df.shape[0])
print("Total columns:", df.shape[1])
print("Available columns:", df.columns.tolist())
print("Unique shops count:", df['ten_kh'].nunique() if 'ten_kh' in df.columns else 0)

print("\nStep 3: Saving cleaned data to data.csv...")
df.to_csv('data.csv', index=False)
print("Update complete! data.csv has been successfully updated with the new sheet structure.")
