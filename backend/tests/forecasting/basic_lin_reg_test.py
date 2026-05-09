from sklearn.linear_model import LinearRegression
import numpy as np


# Test numpy years, which can be from 2016 to 2026
years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]
# Test counts, which can be from 0 to 100
counts = [60, 67, 55, 52, 48, 44, 47, 40]



# Single site, single species
X = np.array(years).reshape(-1, 1)  # Features: year
y = np.array(counts)                 # Target: organism count

model = LinearRegression()
model.fit(X, y)

# Forecast next 3 years
future_years = np.array([2024, 2025, 2026]).reshape(-1, 1)
predictions = model.predict(future_years)

# Print predictions for the next 3 years
for year, pred in zip(future_years.flatten(), predictions):
    print(f"Predicted count for {year}: {pred:.2f}")


# plot this via matplotlib
import matplotlib.pyplot as plt
plt.scatter(years, counts, color='blue', label='Actual Counts')
plt.plot(years, model.predict(X), color='red', label='Linear Fit')
plt.xlabel('Year')
plt.ylabel('Organism Count')
plt.title('Benthic Organism Counts Over Time')
plt.legend()
plt.show()