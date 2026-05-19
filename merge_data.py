import pandas as pd
import numpy as np

# Google Sheet direct CSV export links
URL_VOLUME_OPR = "https://docs.google.com/spreadsheets/d/1Yaf-aMKXxZIrkFCI9RgN6cMNJaaW1PZ0e8up4Dv8Yx8/export?format=csv&gid=654333850"
URL_ROT_LC = "https://docs.google.com/spreadsheets/d/1Yaf-aMKXxZIrkFCI9RgN6cMNJaaW1PZ0e8up4Dv8Yx8/export?format=csv&gid=726474205"

print("Step 1: Fetching Volume_OPR from Google Sheets...")
df_vol = pd.read_csv(URL_VOLUME_OPR)
print(f"Volume_OPR loaded. Original shape: {df_vol.shape}")

print("Step 2: Fetching %RotLC from Google Sheets...")
df_rot = pd.read_csv(URL_ROT_LC)
print(f"%RotLC loaded. Original shape: {df_rot.shape}")

# Clean up index/unnamed columns that Google Sheets / Pandas CSV export might add
def clean_dataframe(df):
    # Drop any columns named 'Unnamed: 0' or empty string
    columns_to_drop = [col for col in df.columns if col.startswith('Unnamed:') or col == '']
    if columns_to_drop:
        df = df.drop(columns=columns_to_drop)
    return df

df_vol = clean_dataframe(df_vol)
df_rot = clean_dataframe(df_rot)

# Drop pct_rot_lc from Volume_OPR if it exists to avoid duplication
if 'pct_rot_lc' in df_vol.columns:
    df_vol = df_vol.drop(columns=['pct_rot_lc'])

print("Step 3: Grouping %RotLC by mapping keys and calculating mean...")
# Group and average drop rates across different shop_ids matching the same (thang, warehouse_id, ten_kh)
df_rot_agg = df_rot.groupby(['thang', 'warehouse_id', 'ten_kh'], as_index=False)['pct_rot_lc'].mean()
print(f"Aggregated %RotLC shape: {df_rot_agg.shape}")

print("Step 4: Performing Left Merge (keeping all Volume_OPR rows)...")
# Keep all data from the primary Volume_OPR source
df_merged = pd.merge(df_vol, df_rot_agg[['thang', 'warehouse_id', 'ten_kh', 'pct_rot_lc']], on=['thang', 'warehouse_id', 'ten_kh'], how='left')

print("Step 5: Filling NaN values with 0.0 for unmatched rows...")
df_merged['pct_rot_lc'] = df_merged['pct_rot_lc'].fillna(0.0)

print("\n--- Merge Verification ---")
print("Volume_OPR clean shape:", df_vol.shape)
print("Aggregated %RotLC shape:", df_rot_agg.shape)
print("Merged shape:", df_merged.shape)
print("Non-zero pct_rot_lc rows:", (df_merged['pct_rot_lc'] > 0).sum())

print("\nStep 6: Saving merged data back to data.csv...")
df_merged.to_csv('data.csv', index=False)
print("Merge complete! data.csv has been updated.")
