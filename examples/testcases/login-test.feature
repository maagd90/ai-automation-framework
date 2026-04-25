Feature: User Authentication
Scenario: Login with valid credentials
  Given User is on the login page
  When Enter "admin@test.com" into Email field
  And Enter "Password123" into Password field
  And Click the Login button
  Then Verify Dashboard is visible
