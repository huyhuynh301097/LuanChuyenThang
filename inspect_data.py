import pandas as pd
df = pd.read_csv('e:/Antigravity/GHN_luan_chuyen_thang/data.csv')
print("VUNG COUNTS:")
print(df['vung'].value_counts(dropna=False))
print("\nKL_TB_NGAY DESCRIBE:")
print(df['kl_tb_ngay'].describe())
print("\nPERCENTILES:")
print(df['kl_tb_ngay'].quantile([0.1, 0.25, 0.5, 0.75, 0.9, 0.95]))
