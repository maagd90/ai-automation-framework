Feature: SauceDemo Login and Shopping

  Background:
    Given I open "https://www.saucedemo.com"

  Scenario: Login with valid credentials
    When I enter "standard_user" in the Username field
    And I enter "secret_sauce" in the Password field
    And I click the Login button
    Then the Products page should be visible

  Scenario: Login with invalid password
    When I enter "standard_user" in the Username field
    And I enter "wrong_password" in the Password field
    And I click the Login button
    Then an error message should be displayed

  Scenario: Add item to cart
    Given I am logged in as "standard_user" with password "secret_sauce"
    When I click the Add to cart button for the first product
    Then the cart badge should show "1"

  Scenario: Complete checkout flow
    Given I am logged in as "standard_user" with password "secret_sauce"
    When I click the Add to cart button for the first product
    And I click the Cart icon
    And I click the Checkout button
    And I enter "Test" in the First Name field
    And I enter "User" in the Last Name field
    And I enter "12345" in the Postal Code field
    And I click the Continue button
    And I click the Finish button
    Then the order confirmation page should be displayed

  Scenario: Logout
    Given I am logged in as "standard_user" with password "secret_sauce"
    When I open the hamburger menu
    And I click the Logout link
    Then the login page should be displayed
