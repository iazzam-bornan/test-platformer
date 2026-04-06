Feature: Task Board Homepage

  The Task Board homepage should load successfully and display
  the main UI elements.

  @smoke
  Scenario: Homepage loads with correct title
    Given I visit the homepage
    Then the page title should not be empty
    And I should see "Task Board"

  @smoke
  Scenario: Stats section is visible
    Given I visit the homepage
    Then I should see "Total"
    And I should see "To Do"
    And I should see "In Progress"
    And I should see "Done"

  Scenario: Add task form is visible
    Given I visit the homepage
    Then I should see an input with placeholder "Add a new task..."
    And I should see a button with text "Add"

  Scenario: Task board columns are rendered
    Given I visit the homepage
    Then I should see 3 columns on the board
