import pandas as pd
import numpy as np

print("Loading data.csv...")
df_data = pd.read_csv('data.csv')

print("Loading %RotLC.xlsx...")
df_rot = pd.read_excel('%RotLC.xlsx')

print("Grouping %RotLC.xlsx by mapping keys...")
# Group and average drop rates across different shop_ids matching the same (thang, warehouse_id, ten_kh)
df_rot_agg = df_rot.groupby(['thang', 'warehouse_id', 'ten_kh'], as_index=False)['pct_rot_lc'].mean()

print("Performing Left Merge prioritizing data.csv...")
# Keep all data from the primary data.csv source
df_merged = pd.merge(df_data, df_rot_agg[['thang', 'warehouse_id', 'ten_kh', 'pct_rot_lc']], on=['thang', 'warehouse_id', 'ten_kh'], how='left')

print("Filling NaN values with 0.0 (defaulting unmatched rows)...")
df_merged['pct_rot_lc'] = df_merged['pct_rot_lc'].fillna(0.0)

print("Checking results...")
print("Original shape:", df_data.shape)
print("Merged shape:", df_merged.shape)
print("Non-zero pct_rot_lc rows:", (df_merged['pct_rot_lc'] > 0).sum())

print("Saving merged data back to data.csv...")
df_merged.to_csv('data.csv', index=False)
print("Merge complete!")
