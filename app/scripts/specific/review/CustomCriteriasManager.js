import AnthropicManager from '../../llm/anthropic/AnthropicManager'
import LLMTextUtils from '../../utils/LLMTextUtils'
import OpenAIManager from '../../llm/openAI/OpenAIManager'
import Alerts from '../../utils/Alerts'
import LanguageUtils from '../../utils/LanguageUtils'
import Events from '../../contentScript/Events'
import Criteria from '../../model/schema/Criteria'
import Level from '../../model/schema/Level'
import Review from '../../model/schema/Review'
import DefaultCriteria from './DefaultCriteria'
import _ from 'lodash'
import $ from 'jquery'
import 'jquery-contextmenu/dist/jquery.contextMenu'
import Config from '../../Config'
import AnnotationUtils from '../../utils/AnnotationUtils'
import jsYaml from 'js-yaml'

class CustomCriteriasManager {
  constructor () {
    this.events = {}
  }

  init (callback) {
    this.createAddCustomCriteriaButtons(() => {
      // Initialize event handlers
      this.initEventHandler()
      // Init context menu for buttons
      this.initContextMenu()
      if (_.isFunction(callback)) {
        callback()
      }
    })
  }

  initEventHandler () {
    this.events.tagsUpdated = {
      element: document,
      event: Events.tagsUpdated,
      handler: () => {
        // this.createAddCustomCriteriaButtons()
        this.initContextMenu()
      }
    }
    this.events.tagsUpdated.element.addEventListener(this.events.tagsUpdated.event, this.events.tagsUpdated.handler, false)
  }

  createAddCustomCriteriaButtons (callback) {
    // this.createAddCustomThemeButton()
    let groups = _.map(document.querySelectorAll('.tagGroup'), (tagGroupElement) => {
      return tagGroupElement.dataset.groupName
    })
    for (let i = 0; i < groups.length; i++) {
      // this.createAddCustomCriteriaButton(groups[i])
    }
    if (_.isFunction(callback)) {
      callback()
    }
  }

  createAddCustomThemeButton () {
    let addCustomThemeButton = document.querySelector('#addCustomThemeElement')
    if (!_.isElement(addCustomThemeButton)) {
      let criteriaHeader = document.querySelector('#groupSelectorContainerHeader')
      let addCustomThemeElement = document.createElement('span')
      addCustomThemeElement.id = 'addCustomThemeElement'
      addCustomThemeElement.classList.add('addCustomCriteriaWhite')
      criteriaHeader.insertAdjacentElement('afterbegin', addCustomThemeElement)
      addCustomThemeElement.addEventListener('click', this.createCustomTheme())
    }
  }

  createCustomTheme () {
    return () => {
      Alerts.inputTextAlert({
        title: 'Creating new review category',
        text: 'You can give a name to the factor that you want to review.',
        input: 'text',
        preConfirm: (themeName) => {
          let themeElement = document.querySelector('.tagGroup[data-group-name="' + themeName + '"')
          if (_.isElement(themeElement)) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('A criteria group with that name already exists.')
            window.abwa.sidebar.openSidebar()
          } else {
            return themeName
          }
        },
        callback: (err, result) => {
          if (err) {
            window.alert('Unable to show form to add custom factor. Contact developer.')
          } else {
            let tagName = LanguageUtils.normalizeStringToValidID(result)
            this.createNewCustomCriteria({
              name: tagName,
              description: '',
              group: tagName,
              callback: () => {
                window.abwa.sidebar.openSidebar()
              }
            })
          }
        }
      })
    }
  }

  createAddCustomCriteriaButton (groupName) {
    // Get container
    let addCriteriaButton = document.querySelector('.groupName[title="' + groupName + '"]').previousElementSibling
    addCriteriaButton.title = 'Add new criteria to ' + groupName

    // Create button for new element
    addCriteriaButton.addEventListener('click', this.createAddCustomCriteriaButtonHandler(groupName))
  }

  createAddCustomCriteriaButtonHandler (groupName) {
    return () => {
      let criteriaName
      let criteriaDescription
      Alerts.multipleInputAlert({
        title: 'Creating a new criterion for category ' + groupName,
        html: '<div>' +
          '<input id="criteriaName" class="swal2-input customizeInput" placeholder="Type your criteria name..."/>' +
          '</div>' +
          '<div>' +
          '<textarea id="criteriaDescription" class="swal2-input customizeInput" placeholder="Type your criteria description..."></textarea>' +
          '</div>',
        preConfirm: () => {
          // Retrieve values from inputs
          criteriaName = document.getElementById('criteriaName').value
          criteriaDescription = document.getElementById('criteriaDescription').value
          // Find if criteria name already exists
          let currentTags = _.map(window.abwa.tagManager.currentTags, tag => tag.config.name)
          let criteriaExists = _.find(currentTags, tag => tag === criteriaName)
          if (_.isString(criteriaExists)) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('A criteria with that name already exists.')
            window.abwa.sidebar.openSidebar()
          }
        },
        callback: (err) => {
          if (err) {
            Alerts.errorAlert({ text: 'Unable to create this custom criteria, try it again.' })
          } else {
            // Check if not selected cancel or esc
            if (criteriaName) {
              this.createNewCustomCriteria({
                name: criteriaName,
                description: criteriaDescription,
                group: groupName,
                callback: () => {
                  window.abwa.sidebar.openSidebar()
                }
              })
            }
          }
        }
      })
    }
  }

  createNewCustomCriteria ({ name, description = 'Custom criteria', group, callback }) {
    let review = new Review({ reviewId: '' })
    review.storageGroup = window.abwa.groupSelector.currentGroup
    let criteria = new Criteria({ name, description, review, group: group, custom: true })
    // Create levels for the criteria
    let levels = DefaultCriteria.defaultLevels
    criteria.levels = []
    for (let j = 0; j < levels.length; j++) {
      let level = new Level({ name: levels[j].name, criteria: criteria })
      criteria.levels.push(level)
    }
    let annotations = criteria.toAnnotations()
    // Push annotations to storage
    window.abwa.storageManager.client.createNewAnnotations(annotations, (err) => {
      if (err) {
        Alerts.errorAlert({
          title: 'Unable to create a custom category',
          text: 'Error when trying to create a new custom category. Please try again.'
        })
        callback(err)
      } else {
        // Reload sidebar
        window.abwa.tagManager.reloadTags(() => {
          if (_.isFunction(callback)) {
            callback()
          }
        })
      }
    })
  }

  destroy () {
    // Remove event listeners
    let events = _.values(this.events)
    for (let i = 0; i < events.length; i++) {
      events[i].element.removeEventListener(events[i].event, events[i].handler)
    }
  }

  static deleteTag (tagGroup, callback) {
    // Get tags used in storage to store this tag or annotations with this tag
    let annotationsToDelete = []
    // Get annotation of the tag group
    annotationsToDelete.push(tagGroup.config.annotation.id)
    window.abwa.storageManager.client.searchAnnotations({
      tags: Config.review.namespace + ':' + Config.review.tags.grouped.relation + ':' + tagGroup.config.name
    }, (err, annotations) => {
      if (err) {
        // TODO Send message unable to delete
      } else {
        annotationsToDelete = annotationsToDelete.concat(_.map(annotations, 'id'))
        // Delete all the annotations
        let promises = []
        for (let i = 0; i < annotationsToDelete.length; i++) {
          promises.push(new Promise((resolve, reject) => {
            window.abwa.storageManager.client.deleteAnnotation(annotationsToDelete[i], (err) => {
              if (err) {
                reject(new Error('Unable to delete annotation id: ' + annotationsToDelete[i]))
              } else {
                resolve()
              }
            })
            return true
          }))
        }
        // When all the annotations are deleted
        Promise.all(promises).catch(() => {
          Alerts.errorAlert({ text: 'There was an error when trying to delete all the annotations for this tag, please reload and try it again.' })
        }).then(() => {
          if (_.isFunction(callback)) {
            callback()
          }
        })
      }
    })
  }

  static deleteTagAnnotations (tag, callback) {
    // Get tags used in storage to store this tag or annotations with this tag
    let annotationsToDelete = []
    // Get annotation of the tag group
    window.abwa.storageManager.client.searchAnnotations({
      tags: tag[0]
    }, (err, annotations) => {
      if (err) {
        // TODO Send message unable to delete
      } else {
        annotationsToDelete = annotationsToDelete.concat(_.map(annotations, 'id'))
        // Delete all the annotations
        let promises = []
        for (let i = 0; i < annotationsToDelete.length; i++) {
          promises.push(new Promise((resolve, reject) => {
            window.abwa.storageManager.client.deleteAnnotation(annotationsToDelete[i], (err) => {
              if (err) {
                reject(new Error('Unable to delete annotation id: ' + annotationsToDelete[i]))
              } else {
                resolve()
              }
            })
            return true
          }))
        }
        // When all the annotations are deleted
        Promise.all(promises).catch(() => {
          Alerts.errorAlert({ text: 'There was an error when trying to delete all the annotations for this tag, please reload and try it again.' })
        }).then(() => {
          if (_.isFunction(callback)) {
            callback()
          }
        })
      }
    })
  }

  destroyContextMenus () {
    let arrayOfTagGroups = _.values(window.abwa.tagManager.currentTags)
    arrayOfTagGroups.forEach(tagGroup => {
      let selector = '[data-mark="' + tagGroup.config.name + '"]'
      if (selector) {
        $.contextMenu('destroy', selector)
      }
    })
  }

  initContextMenu () {
    this.destroyContextMenus()
    this.initContextMenuForCriteria()
    this.initContextMenuForCriteriaGroups()
  }

  initContextMenuForCriteriaGroups () {
    let items = {}
    // Modify menu element
    items['modify'] = { name: 'Modify criteria group' }
    // If custom criteria, it is also possible to delete it
    items['delete'] = { name: 'Delete criteria group' }
    $.contextMenu({
      selector: '.tagGroup[data-group-name]',
      build: () => {
        return {
          callback: (key, ev) => {
            let criteriaGroupName = ev.$trigger.attr('data-group-name')
            if (key === 'delete') {
              // TODO
              this.deleteCriteriaGroup(criteriaGroupName)
            } else if (key === 'modify') {
              // TODO
              this.modifyCriteriaGroup(criteriaGroupName)
            }
          },
          items: items
        }
      }
    })
  }

  modifyCriteriaGroup (criteriaGroupName, callback) {
    // Get all criteria with criteria group name
    let arrayOfTagGroups = _.filter(_.values(window.abwa.tagManager.currentTags), tag => tag.config.options.group === criteriaGroupName)
    Alerts.inputTextAlert({
      title: 'Rename criteria group ' + criteriaGroupName,
      inputValue: criteriaGroupName,
      inputPlaceholder: 'Write the group name here...',
      input: 'text',
      preConfirm: (themeName) => {
        if (_.isEmpty(themeName)) {
          const swal = require('sweetalert2')
          swal.showValidationMessage('The criteria group name cannot be empty.')
        } else if (themeName === criteriaGroupName) {
          return null
        } else {
          let themeElement = document.querySelector('.tagGroup[data-group-name="' + themeName + '"')
          if (_.isElement(themeElement)) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('A criteria group with that name already exists.')
            window.abwa.sidebar.openSidebar()
          } else {
            return themeName
          }
        }
      },
      callback: (err, groupName) => {
        if (err) {
          window.alert('Unable to show form to modify custom criteria group. Contact developer.')
        } else {
          if (_.isNull(groupName)) {
            window.abwa.sidebar.openSidebar()
          } else {
            // Modify group in all criteria and update tag manager
            let promises = []
            for (let i = 0; i < arrayOfTagGroups.length; i++) {
              let tagGroup = arrayOfTagGroups[i]
              promises.push(new Promise((resolve, reject) => {
                CustomCriteriasManager.modifyCriteria({
                  tagGroup,
                  group: groupName,
                  callback: (err) => {
                    if (err) {
                      reject(err)
                    } else {
                      resolve()
                    }
                  }
                })
              }))
            }
            Promise.all(promises).catch(() => {
              Alerts.errorAlert({ text: 'Unable to modify criteria group name.' })
            }).then(() => {
              window.abwa.tagManager.reloadTags(() => {
                window.abwa.contentAnnotator.updateAllAnnotations(() => {
                  window.abwa.sidebar.openSidebar()
                })
              })
            })
          }
        }
      }
    })
  }

  deleteCriteriaGroup (criteriaGroupName, callback) {
    // Get all criteria with criteria group name
    let arrayOfTagGroups = _.filter(_.values(window.abwa.tagManager.currentTags), tag => tag.config.options.group === criteriaGroupName)
    // Ask user if they are sure to delete the current tag
    Alerts.confirmAlert({
      alertType: Alerts.alertType.warning,
      title: chrome.i18n.getMessage('DeleteCriteriaGroupConfirmationTitle', criteriaGroupName),
      text: chrome.i18n.getMessage('DeleteCriteriaGroupConfirmationMessage'),
      callback: (err, toDelete) => {
        // It is run only when the user confirms the dialog, so delete all the annotations
        if (err) {
          // Nothing to do
        } else {
          let promises = []
          for (let i = 0; i < arrayOfTagGroups.length; i++) {
            promises.push(new Promise((resolve, reject) => {
              this.deleteTag(arrayOfTagGroups[i], () => {
                if (err) {
                  reject(err)
                } else {
                  resolve()
                }
              })
              return true
            }))
          }
          Promise.all(promises).catch((err) => {
            Alerts.errorAlert({ text: 'Error when deleting criteria group. Error:<br/>' + err })
          }).then(() => {
            window.abwa.tagManager.reloadTags(() => {
              window.abwa.contentAnnotator.updateAllAnnotations(() => {
                window.abwa.sidebar.openSidebar()
                if (_.isFunction(callback)) {
                  callback()
                }
              })
            })
          })
        }
      }
    })
  }

  initContextMenuForCriteria () {
    // Define context menu items
    let arrayOfTagGroups = _.values(window.abwa.tagManager.currentTags)
    for (let i = 0; i < arrayOfTagGroups.length; i++) {
      let tagGroup = arrayOfTagGroups[i]
      let criterion = tagGroup.config.name
      let description = tagGroup.config.options.description
      let items = {}
      if (tagGroup.config.options.group === 'Premises') {
        // Highlight criterion by LLM
        items['annotatePremise'] = { name: 'State premise with annotation' }
        // Find alternative viewpoints by LLM
        items['recap'] = { name: 'Recap' }
      } else if (tagGroup.config.options.group === 'Critical questions') {
        // Highlight criterion by LLM
        items['annotateCriticalQuestion'] = { name: 'Formulate question' }
        // Assess criterion by LLM
        // items['compile'] = { name: 'Compile' }
        // Find alternative viewpoints by LLM
        // items['alternative'] = { name: 'Provide viewpoints' }
        // Find alternative viewpoints by LLM
        items['recap'] = { name: 'Recap' }
      }
      $.contextMenu({
        selector: '[data-mark="' + tagGroup.config.name + '"]',
        build: () => {
          return {
            callback: (key) => {
              // Get latest version of tag
              let currentTagGroup = _.find(window.abwa.tagManager.currentTags, currentTag => currentTag.config.annotation.id === tagGroup.config.annotation.id)
              if (key === 'compile') {
                this.getParagraphs(criterion, (paragraphs) => {
                  if (paragraphs) {
                    CustomCriteriasManager.compile(criterion, description, paragraphs, currentTagGroup.config.annotation)
                  } else {
                    Alerts.errorAlert({
                      title: 'There are not annotations',
                      text: 'Please, annotate some paragraphs to assess the ' + criterion + ' criterion'
                    })
                  }
                })
              } else if (key === 'alternative') {
                this.getParagraphs(criterion, (paragraphs) => {
                  if (paragraphs) {
                    CustomCriteriasManager.alternative(criterion, description, paragraphs, currentTagGroup.config.annotation)
                  } else {
                    Alerts.errorAlert({
                      title: 'There are not annotations',
                      text: 'Please, highlight some paragraphs to assess the ' + criterion + ' criterion'
                    })
                  }
                })
              } else if (key === 'recap') {
                CustomCriteriasManager.recap(currentTagGroup)
              } else if (key === 'annotatePremise') {
                this.annotatePremise(criterion, description, currentTagGroup.config.annotation)
              } else if (key === 'annotateCriticalQuestion') {
                this.formulateCriticalQuestion(criterion, description, currentTagGroup.config.annotation)
              }
            },
            items: items
          }
        }
      })
    }
  }

  static showParagraph (annotation, criterion) {
    if (annotation) {
      Alerts.infoAlert({
        title: 'The LLM suggests this information for ' + criterion + ' answering ' + annotation.question,
        text: annotation.paragraph + '<br/><br/>' + ' that justifies ' + annotation.text,
        confirmButtonText: 'OK',
        showCancelButton: false
      })
    }
  }

  static showAnnotatedParagraph (annotation, criterion) {
    if (annotation) {
      Alerts.infoAlert({
        title: 'The LLM suggests this information for ' + criterion + ' answering ' + annotation.question,
        text: annotation.paragraph + '<br/><br/>' + ' that justifies ' + annotation.text,
        confirmButtonText: 'OK',
        showCancelButton: false
      })
    }
  }

  static deleteCriteriaHandler (tagGroup) {
    window.abwa.sidebar.closeSidebar()
    // Ask user if they are sure to delete the current tag
    Alerts.confirmAlert({
      alertType: Alerts.alertType.warning,
      title: chrome.i18n.getMessage('DeleteCriteriaConfirmationTitle'),
      text: chrome.i18n.getMessage('DeleteCriteriaConfirmationMessage'),
      callback: (err, toDelete) => {
        // It is run only when the user confirms the dialog, so delete all the annotations
        if (err) {
          // Nothing to do
        } else {
          CustomCriteriasManager.deleteTag(tagGroup, () => {
            window.abwa.tagManager.reloadTags(() => {
              window.abwa.contentAnnotator.updateAllAnnotations(() => {
                window.abwa.sidebar.openSidebar()
              })
            })
          })
        }
      }
    })
  }

  static modifyCriteriaHandler (tagGroup, defaultNameValue = null, defaultDescriptionValue = null, defaultFullQuestion = null) {
    let criteriaName
    let criteriaDescription
    let formCriteriaNameValue = defaultNameValue || tagGroup.config.name
    let formCriteriaNameValueForm
    if (formCriteriaNameValue.includes('CQ')) {
      formCriteriaNameValueForm = 'critical question'
    } else {
      formCriteriaNameValueForm = formCriteriaNameValue + ' premise'
    }
    let formCriteriaDescriptionValue = defaultDescriptionValue || tagGroup.config.options.description
    let fullQuestion = defaultFullQuestion || tagGroup.config.options.fullQuestion || ''
    let custom = tagGroup.config.options.custom || false
    let html = '<div>' +
      '<span style="text-align: left;">Name</span>' +
      '<input readonly id="criteriaName" class="swal2-input customizeInput" value="' + formCriteriaNameValue + '"/>' +
      '</span>' +
      '<div>' +
      '<span style="text-align: left;">Description</span>' +
      '<textarea readonly id="criteriaDescription" class="swal2-input customizeInput" placeholder="Description">' + formCriteriaDescriptionValue + '</textarea>' +
      '</div>'
    if (tagGroup.config.options.group === 'Critical questions') {
      html += '<span style="text-align:left">Instantiation</span><textarea  id="fullQuestion" class="swal2-input customizeInput" placeholder="Formulated question">' + fullQuestion + '</textarea></div>'
    }
    Alerts.threeOptionsAlert({
      title: 'Modifying name and description for ' + formCriteriaNameValueForm,
      html: html,
      preConfirm: () => {
        // Retrieve values from inputs
        criteriaName = document.getElementById('criteriaName').value
        criteriaDescription = document.getElementById('criteriaDescription').value
        if (tagGroup.config.options.group === 'Critical questions') {
          fullQuestion = document.getElementById('fullQuestion').value
        }
      },
      callback: () => {
        // Revise to execute only when OK button is pressed or criteria name and descriptions are not undefined
        if (!_.isUndefined(criteriaName) && !_.isUndefined(criteriaDescription)) {
          if (!fullQuestion) {
            fullQuestion = ''
          }
          CustomCriteriasManager.modifyCriteria({
            tagGroup: tagGroup,
            name: criteriaName,
            description: criteriaDescription,
            fullQuestion: fullQuestion,
            custom,
            callback: (err) => {
              if (err) {
                Alerts.errorAlert({ text: 'Unable to update criteria. Error:<br/>' + err.message })
              } else {
                window.abwa.tagManager.reloadTags(() => {
                  window.abwa.contentAnnotator.updateAllAnnotations(() => {
                    window.abwa.sidebar.openSidebar()
                  })
                })
              }
            }
          })
        }
      },
      denyButtonText: 'Delete',
      denyButtonColor: '#d33',
      denyCallback: () => {
        CustomCriteriasManager.deleteCriteriaHandler(tagGroup)
      }
    })
  }

  static modifyCriteria ({ tagGroup, name, description, fullQuestion, custom = true, group, callback }) {
    // Check if name has changed
    if (name === tagGroup.config.name || _.isUndefined(name)) {
      // Check if description has changed
      if ((description !== tagGroup.config.options.description || _.isUndefined(description)) || (fullQuestion !== tagGroup.config.options.fullQuestion || _.isUndefined(fullQuestion))) {
        name = name || tagGroup.config.name
        description = description || tagGroup.config.options.description
        if (fullQuestion !== tagGroup.config.options.fullQuestion || _.isUndefined(fullQuestion)) {
          fullQuestion = fullQuestion || tagGroup.config.options.fullQuestion
        } else {
          fullQuestion = ''
        }
        // Update annotation description
        let oldAnnotation = tagGroup.config.annotation
        // Create new annotation
        let review = new Review({ reviewId: '' })
        review.storageGroup = window.abwa.groupSelector.currentGroup
        let criteria = new Criteria({
          name: name,
          description: description,
          fullQuestion: fullQuestion,
          group: group || tagGroup.config.options.group,
          review,
          custom: custom
        })
        let annotation = criteria.toAnnotation()
        window.abwa.storageManager.client.updateAnnotation(oldAnnotation.id, annotation, (err, annotation) => {
          if (err) {
            // TODO Show err
            if (_.isFunction(callback)) {
              callback(err)
            }
          } else {
            if (_.isFunction(callback)) {
              callback()
            }
          }
        })
      }
    } else {
      // If name has changed, check if there is not other criteria with the same value
      if (CustomCriteriasManager.alreadyExistsThisCriteriaName(name)) {
        // Alert already exists
        Alerts.errorAlert({
          title: 'Criteria already exists',
          text: 'A criteria with the name ' + name + ' already exists.',
          callback: () => {
            this.modifyCriteriaHandler(tagGroup, name, description)
          }
        })
      } else {
        // Update all annotations review:isCriteriaOf:
        window.abwa.storageManager.client.searchAnnotations({
          tags: Config.review.namespace + ':' + Config.review.tags.grouped.relation + ':' + tagGroup.config.name
        }, (err, annotationsToUpdateTag) => {
          if (err) {
            // Unable to update
            Alerts.errorAlert({ text: 'Unable to update criteria.' })
          } else {
            let oldTag = Config.review.namespace + ':' + Config.review.tags.grouped.relation + ':' + tagGroup.config.name
            let newTag = Config.review.namespace + ':' + Config.review.tags.grouped.relation + ':' + name
            // Update annotations tag
            annotationsToUpdateTag = _.map(annotationsToUpdateTag, (annotation) => {
              // Change isCriteriOf tag with the new one
              return AnnotationUtils.modifyTag(annotation, oldTag, newTag)
            })
            // Update all annotations
            let promises = []
            for (let i = 0; i < annotationsToUpdateTag.length; i++) {
              promises.push(new Promise((resolve, reject) => {
                window.abwa.storageManager.client.updateAnnotation(annotationsToUpdateTag[i].id, annotationsToUpdateTag[i], (err, annotation) => {
                  if (err) {
                    reject(err)
                  } else {
                    resolve(annotation)
                  }
                })
              }))
            }
            Promise.all(promises).catch(() => {
              // TODO Some annotations where unable to update
            }).then(() => {
              // Update tagGroup annotation
              let review = new Review({ reviewId: '' })
              review.storageGroup = window.abwa.groupSelector.currentGroup
              let criteria = new Criteria({
                name,
                description,
                fullQuestion,
                group: tagGroup.config.options.group,
                review,
                custom: custom
              })
              let annotation = criteria.toAnnotation()
              let oldAnnotation = tagGroup.config.annotation
              window.abwa.storageManager.client.updateAnnotation(oldAnnotation.id, annotation, (err, annotation) => {
                if (err) {
                  Alerts.errorAlert({ text: 'Unable to update criteria. Error: ' + err.message })
                } else {
                  if (_.isFunction(callback)) {
                    callback()
                  }
                }
              })
            })
          }
        })
      }
    }
  }

  removeTextBetween (s, start, end) {
    let startIdx = s.indexOf(start)
    let endIdx = s.indexOf(end, startIdx)
    if (startIdx === -1 || endIdx === -1) {
      return s // start or end not found, return original string
    }
    return s.substring(0, startIdx) + s.substring(endIdx + end.length)
  }

  annotatePremise (criterion, description, tagAnnotation) {
    if (description.length < 20) {
      Alerts.infoAlert({ text: 'You have to provide a description for the given criterion' })
    } else {
      // this.modifyCriteriaHandler(currentTagGroup)
      chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
        if (llm === '') {
          llm = Config.review.defaultLLM
        }
        if (llm && llm !== '') {
          let selectedLLM = llm
          Alerts.confirmAlert({
            title: 'Find annotations for ' + criterion + ' premise',
            text: 'Do you want to state the premises using ' + llm.charAt(0).toUpperCase() + llm.slice(1) + '?',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let excerpt = json.excerpt
                  let statement = json.statement
                  let selectors = this.getSelectorsFromLLM(excerpt, documents)
                  let annotation = {
                    paragraph: excerpt,
                    text: statement,
                    selectors: selectors
                  }
                  if (selectors.length > 0) {
                    let commentData = {
                      comment: '',
                      statement: statement,
                      llm: llm,
                      paragraph: excerpt
                    }
                    let model = window.abwa.tagManager.model
                    let tag = [
                      model.namespace + ':' + model.config.grouped.relation + ':' + criterion
                    ]
                    CustomCriteriasManager.deleteTagAnnotations(tag, () => {
                      LanguageUtils.dispatchCustomEvent(Events.annotateByLLM, {
                        tags: tag,
                        selectors: selectors,
                        commentData: commentData
                      })
                    })
                  }
                  if (annotation.selectors.length === 0) {
                    CustomCriteriasManager.showParagraph(annotation, criterion)
                  } else {
                    CustomCriteriasManager.showAnnotatedParagraph(annotation, criterion)
                  }
                  // retrieve tag annotation
                  let data
                  if (tagAnnotation.text) {
                    data = jsYaml.load(tagAnnotation.text)
                    // Check if data.resume exists and is an array. If not, initialize it as an empty array.
                    data.compile = []
                    // Now that we're sure data.resume is an array, push the new object into it.
                    data.compile.push({ document: window.abwa.contentTypeManager.pdfFingerprint, answer: statement })
                  }
                  tagAnnotation.text = jsYaml.dump(data)
                  LanguageUtils.dispatchCustomEvent(Events.updateTagAnnotation, {annotation: tagAnnotation})
                  Alerts.successAlert({title: 'Saved', text: 'The text has been saved in the report'})
                }
                if (apiKey && apiKey !== '') {
                  chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'annotatePremisePrompt'} }, ({ prompt }) => {
                    if (!prompt) {
                      prompt = Config.prompts.annotatePremisePrompt
                    }
                    let scheme = ''
                    if (window.abwa.tagManager) {
                      let currentTags = window.abwa.tagManager.currentTags
                      // Retrieve Premises
                      let premises = currentTags.filter(tag => {
                        return tag.config.options.group === 'Premises'
                      })
                      let conclusion
                      for (let i = 0; i < premises.length; i++) {
                        const premise = premises[i]
                        if (premise.config.name === 'Conclusion') {
                          conclusion = premise
                        } else {
                          scheme += premise.config.name.toUpperCase() + ' PREMISE: '
                          scheme += premise.config.options.description + '\n'
                        }
                      }
                      scheme += conclusion.config.name.toUpperCase() + ': '
                      scheme += conclusion.config.options.description + '\n'
                    }
                    prompt = prompt.replaceAll('[C_DESCRIPTION]', description).replaceAll('[C_NAME]', criterion).replaceAll('[C_SCHEME]', scheme)
                    let params = {
                      criterion: criterion,
                      description: description,
                      apiKey: apiKey,
                      documents: documents,
                      callback: callback,
                      prompt: prompt,
                      selectedLLM
                    }
                    if (selectedLLM === 'anthropic') {
                      AnthropicManager.askCriteria(params)
                    } else if (selectedLLM === 'openAI') {
                      OpenAIManager.askCriteria(params)
                    }
                  })
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        }
      })
    }
  }

  formulateCriticalQuestion (criterion, description, tagAnnotation) {
    if (description.length < 20) {
      Alerts.infoAlert({ text: 'You have to provide a description for the given criterion' })
    } else {
      // this.modifyCriteriaHandler(currentTagGroup)
      chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
        if (llm === '') {
          llm = Config.review.defaultLLM
        }
        if (llm && llm !== '') {
          let selectedLLM = llm
          Alerts.confirmAlert({
            title: 'Formulate ' + criterion,
            text: 'Do you want to answer the critical question using ' + llm.charAt(0).toUpperCase() + llm.slice(1) + '?',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let excerpt = json.excerpt
                  let question = json.adaptedQuestion
                  let answer = json.answer
                  let selectors = this.getSelectorsFromLLM(excerpt, documents)
                  let annotation = {
                    paragraph: excerpt,
                    text: answer,
                    question: question,
                    selectors: selectors
                  }
                  if (selectors.length > 0) {
                    let commentData = {
                      comment: '',
                      statement: answer,
                      llm: llm,
                      paragraph: excerpt
                    }
                    let model = window.abwa.tagManager.model
                    let tag = [
                      model.namespace + ':' + model.config.grouped.relation + ':' + criterion
                    ]
                    CustomCriteriasManager.deleteTagAnnotations(tag, () => {
                      LanguageUtils.dispatchCustomEvent(Events.annotateByLLM, {
                        tags: tag,
                        selectors: selectors,
                        commentData: commentData
                      })
                    })
                  }
                  if (annotation.selectors.length === 0) {
                    CustomCriteriasManager.showParagraph(annotation, criterion)
                  } else {
                    CustomCriteriasManager.showAnnotatedParagraph(annotation, criterion)
                  }
                  // retrieve tag annotation
                  let data
                  if (tagAnnotation.text) {
                    data = jsYaml.load(tagAnnotation.text)
                    // Check if data.resume exists and is an array. If not, initialize it as an empty array.
                    data.compile = []
                    data.fullQuestion = question
                    // Now that we're sure data.resume is an array, push the new object into it.
                    data.compile.push({ document: window.abwa.contentTypeManager.pdfFingerprint, answer: answer })
                  }
                  tagAnnotation.text = jsYaml.dump(data)
                  LanguageUtils.dispatchCustomEvent(Events.updateTagAnnotation, {annotation: tagAnnotation})
                  Alerts.successAlert({title: 'Saved', text: 'The text has been saved in the report'})
                }
                if (apiKey && apiKey !== '') {
                  chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'criticalQuestionPrompt'} }, ({ prompt }) => {
                    if (!prompt) {
                      prompt = Config.prompts.criticalQuestionPrompt
                    }
                    let scheme = ''
                    if (window.abwa.tagManager) {
                      let currentTags = window.abwa.tagManager.currentTags
                      // Retrieve Premises
                      let premises = currentTags.filter(tag => {
                        return tag.config.options.group === 'Premises'
                      })
                      let conclusion
                      for (let i = 0; i < premises.length; i++) {
                        const premise = premises[i]
                        if (premise.config.name === 'Conclusion') {
                          conclusion = premise
                        } else {
                          scheme += premise.config.name.toUpperCase() + ' PREMISE: '
                          if (premise.config.options.compile.answer) {
                            scheme += premise.config.options.compile.answer + '\n'
                          } else {
                            scheme += premise.config.options.description + '\n'
                          }
                        }
                      }
                      scheme += conclusion.config.name.toUpperCase() + ': '
                      if (conclusion.config.options.compile.answer) {
                        scheme += conclusion.config.options.compile.answer + '\n'
                      } else {
                        scheme += conclusion.config.options.description + '\n'
                      }
                    }
                    prompt = prompt.replaceAll('[C_DESCRIPTION]', description).replaceAll('[C_SCHEME]', scheme)
                    let params = {
                      criterion: criterion,
                      description: description,
                      apiKey: apiKey,
                      documents: documents,
                      callback: callback,
                      prompt: prompt,
                      selectedLLM
                    }
                    if (selectedLLM === 'anthropic') {
                      AnthropicManager.askCriteria(params)
                    } else if (selectedLLM === 'openAI') {
                      OpenAIManager.askCriteria(params)
                    }
                  })
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        }
      })
    }
  }

  static compile (criterion, description, paragraphs, annotation) {
    if (description.length < 20) {
      Alerts.infoAlert({ text: 'You have to provide a description for the given criterion' })
    } else {
      // this.modifyCriteriaHandler(currentTagGroup)
      chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
        if (llm === '') {
          llm = Config.review.defaultLLM
        }
        if (llm && llm !== '') {
          let selectedLLM = llm
          Alerts.confirmAlert({
            title: criterion + ' assessment',
            text: '<div style="text-align: justify;text-justify: inter-word">Do you want to compile the assessment using ' + llm + '?</div>',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let sentiment = json.sentiment
                  let answer = json.comment
                  Alerts.answerCriterionAlert({
                    title: 'The criterion ' + criterion + ' is ' + sentiment,
                    answer: answer,
                    paragraphs: paragraphs,
                    description: description,
                    criterion: criterion,
                    annotation: annotation,
                    type: 'compile',
                    compileSentiment: sentiment
                  })
                }
                if (apiKey && apiKey !== '') {
                  chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'compilePrompt'} }, ({ prompt }) => {
                    let compilePrompt
                    if (prompt) {
                      compilePrompt = prompt
                    } else {
                      compilePrompt = Config.prompts.compilePrompt
                    }
                    compilePrompt = compilePrompt.replaceAll('[C_DESCRIPTION]', description).replaceAll('[C_NAME]', criterion).replaceAll('[C_EXCERPTS]', paragraphs)
                    let params = {
                      criterion: criterion,
                      description: description,
                      apiKey: apiKey,
                      documents: documents,
                      callback: callback,
                      prompt: compilePrompt
                    }
                    if (selectedLLM === 'anthropic') {
                      AnthropicManager.askCriteria(params)
                    } else if (selectedLLM === 'openAI') {
                      OpenAIManager.askCriteria(params)
                    }
                  })
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        }
      })
    }
  }

  static alternative (criterion, description, paragraphs, annotation) {
    if (description.length < 20) {
      Alerts.infoAlert({ text: 'You have to provide a description for the given criterion' })
    } else {
      chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
        if (llm === '') {
          llm = Config.review.defaultLLM
        }
        if (llm && llm !== '') {
          let selectedLLM = llm
          Alerts.confirmAlert({
            title: criterion + ' assessment',
            text: '<div style="text-align: justify;text-justify: inter-word">Do you want to generate alternative view points for this criterion using ' + llm + '?</div>',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let answer = json.answer
                  Alerts.answerCriterionAlert({
                    title: 'These are the alternative viewpoint for ' + criterion,
                    answer: answer,
                    description: description,
                    criterion: criterion,
                    annotation: annotation,
                    type: 'alternative'
                  })
                }
                if (apiKey && apiKey !== '') {
                  chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'alternativePrompt'} }, ({ prompt }) => {
                    let alternativePrompt
                    if (prompt) {
                      alternativePrompt = prompt
                    } else {
                      alternativePrompt = Config.prompts.alternativePrompt
                    }
                    alternativePrompt = alternativePrompt.replaceAll('[C_DESCRIPTION]', description).replaceAll('[C_NAME]', criterion).replaceAll('[C_EXCERPTS]', paragraphs)
                    let params = {
                      criterion: criterion,
                      description: description,
                      apiKey: apiKey,
                      documents: documents,
                      callback: callback,
                      prompt: alternativePrompt
                    }
                    if (selectedLLM === 'anthropic') {
                      AnthropicManager.askCriteria(params)
                    } else if (selectedLLM === 'openAI') {
                      OpenAIManager.askCriteria(params)
                    }
                  })
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        }
      })
    }
  }

  /**
   * Returns true if this criteria already exists, otherwise false
   * @param name
   * @return {boolean}
   */
  static alreadyExistsThisCriteriaName (name) {
    return !!_.find(window.abwa.tagManager.currentTags, (tag) => { return tag.config.name === name })
  }

  getSelectorsFromLLM (paragraph, documents) {
    let selectors = []
    let pageNumber = LLMTextUtils.getPageNumberFromDocuments(paragraph, documents)
    if (pageNumber) {
      let fragmentSelector = {
        type: 'FragmentSelector',
        conformsTo: 'http://tools.ietf.org/rfc/rfc3778',
        page: pageNumber
      }
      selectors.push(fragmentSelector)
      // let pageContent = LLMTextUtils.getPageContent(pageNumber)
      let page = documents.find(document => document.metadata.loc.pageNumber === pageNumber)
      let pageContent = page.pageContent
      pageContent = pageContent.replace(/(\r\n|\n|\r)/gm, ' ')
      let index = LLMTextUtils.getIndexesOfParagraph(pageContent, paragraph)
      let textPositionSelector = {
        type: 'TextPositionSelector',
        start: index,
        end: index + paragraph.length
      }
      selectors.push(textPositionSelector)
      let textQuoteSelector = {
        type: 'TextQuoteSelector',
        exact: pageContent.substring(index, index + paragraph.length),
        prefix: pageContent.substring(index - 32, index),
        suffix: pageContent.substring(index + paragraph.length, index + paragraph.length + 32)
      }
      selectors.push(textQuoteSelector)
    }
    return selectors
  }

  static recap (currentTagGroup) {
    let criterion = currentTagGroup.config.name
    let tagGroupAnnotations
    let paragraphs = []
    if (window.abwa.contentAnnotator) {
      let annotations = window.abwa.contentAnnotator.allAnnotations
      // Mark as chosen annotated tags
      for (let i = 0; i < annotations.length; i++) {
        let model = window.abwa.tagManager.model
        let tag = model.namespace + ':' + model.config.grouped.relation + ':' + criterion
        tagGroupAnnotations = annotations.filter((annotation) => {
          return AnnotationUtils.hasATag(annotation, tag)
        })
      }
    }
    if (tagGroupAnnotations) {
      for (let i = 0; i < tagGroupAnnotations.length; i++) {
        let annotation = tagGroupAnnotations[i]
        let selectors = annotation.target[0].selector
        let pageSelector
        if (selectors) {
          pageSelector = selectors.find((selector) => {
            return selector.type === 'FragmentSelector'
          })
        }
        if (annotation.text) {
          let body = JSON.parse(annotation.text)
          if (body.paragraph) {
            paragraphs.push('(page ' + pageSelector.page + '): ' + body.paragraph.replace(/(\r\n|\n|\r)/gm, ''))
          } else {
            let fragmentTextSelector
            if (selectors) {
              fragmentTextSelector = selectors.find((selector) => {
                return selector.type === 'TextQuoteSelector'
              })
            }
            if (fragmentTextSelector) {
              paragraphs.push('(page' + pageSelector.page + '): ' + fragmentTextSelector.exact.replace(/(\r\n|\n|\r)/gm, ''))
            }
          }
        }
      }
    }
    let compile = ''
    if (currentTagGroup.config.options.compile !== '') {
      const findResume = currentTagGroup.config.options.compile.find((resume) => {
        return resume.document === window.abwa.contentTypeManager.pdfFingerprint
      })
      if (findResume) {
        compile = findResume
      }
    }
    let alternative = ''
    if (currentTagGroup.config.options.alternative !== '') {
      const findAlternative = currentTagGroup.config.options.alternative.find((alternative) => {
        return alternative.document === window.abwa.contentTypeManager.pdfFingerprint
      })
      if (findAlternative) {
        alternative = findAlternative.answer
      }
    }
    if (compile || alternative || paragraphs.length > 0) {
      let html = '<div width=900px style="text-align: justify;text-justify: inter-word">'
      if (compile) {
        html += '<h3>Description:</h3><div width=800px>' + currentTagGroup.config.options.description + '</div></br>'
      }
      if (currentTagGroup.config.options.fullQuestion) {
        html += '<h3>Question:</h3><div width=800px>' + currentTagGroup.config.options.fullQuestion + '</div></br>'
      }
      if (compile) {
        html += '<h3>Statement:</h3><div width=800px>' + compile.answer + '</div></br>'
      }
      if (alternative) {
        html += '<h3>Provided alternatives:</h3><div width=800px>' + alternative + '</div></br>'
      }
      if (paragraphs.length > 0) {
        html += '<h3>Excerpts:</h3></br><ul>'
        for (const item of paragraphs) {
          html += `<div style="margin-left: 30px"><li>${item}</li></div></br>`
        }
        html += '</ul></div>'
      }
      html += '</div>'
      Alerts.criterionInfoAlert({ title: 'Criterion Review: ' + criterion, text: html })
    } else {
      Alerts.errorAlert({
        title: 'No assessed',
        text: 'You must assess this criteria. Highlight, resume or find alternatives for the criterion.'
      })
    }
  }

  getParagraphs (criterion, callback) {
    let tagGroupAnnotations
    let paragraphs
    if (window.abwa.contentAnnotator) {
      let annotations = window.abwa.contentAnnotator.allAnnotations
      // Mark as chosen annotated tags
      for (let i = 0; i < annotations.length; i++) {
        let model = window.abwa.tagManager.model
        let tag = model.namespace + ':' + model.config.grouped.relation + ':' + criterion
        tagGroupAnnotations = annotations.filter((annotation) => {
          return AnnotationUtils.hasATag(annotation, tag)
        })
      }
    }
    if (tagGroupAnnotations) {
      paragraphs = ''
      for (let i = 0; i < tagGroupAnnotations.length; i++) {
        let annotation = tagGroupAnnotations[i]
        if (annotation.text) {
          let body = JSON.parse(annotation.text)
          if (body.paragraph) {
            let paragraphNumber = i + 1
            paragraphs += 'paragraph' + paragraphNumber + ': ' + body.paragraph.replace(/(\r\n|\n|\r)/gm, '') + '\n'
          } else {
            let selectors = annotation.target[0].selector
            let fragmentTextSelector
            if (selectors) {
              fragmentTextSelector = selectors.find((selector) => {
                return selector.type === 'TextQuoteSelector'
              })
            }
            if (fragmentTextSelector) {
              let paragraphNumber = i + 1
              paragraphs += 'paragraph' + paragraphNumber + ': ' + fragmentTextSelector.exact.replace(/(\r\n|\n|\r)/gm, '') + '\n'
            }
          }
        }
      }
    }
    if (_.isFunction(callback)) {
      callback(paragraphs)
    }
  }
}

export default CustomCriteriasManager
